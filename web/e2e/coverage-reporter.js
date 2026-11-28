import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CoverageReport } from "monocart-coverage-reports";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "web/browser-coverage");

function bundlePath(url) {
  const { pathname } = new URL(url);
  const asset = /^\/(?:(graph|viewer)\/)?(assets\/[\w.-]+\.js)$/.exec(pathname);
  if (!asset) return null;
  const dist = {
    graph: "obsidian-arrow/dist-hosted",
    viewer: "viewer/dist",
  }[asset[1]] ?? "web/dist";
  return resolve(root, dist, asset[2]);
}

export default class BrowserCoverageReporter {
  attachments = [];
  sourceMaps = new Map();

  onTestEnd(_test, result) {
    if (result.status === "passed") {
      this.attachments.push(
        ...result.attachments
          .filter(({ name, path }) => name === "browser-coverage" && path)
          .map(({ path }) => path),
      );
    }
  }

  async onEnd(result) {
    if (result.status !== "passed") return;

    try {
      await this.generateReport();
    } catch (error) {
      console.error("Failed to generate browser coverage:", error);
      return { status: "failed" };
    }
  }

  async generateReport() {
    const report = new CoverageReport({
      baseDir: root,
      outputDir: output,
      reports: ["lcovonly"],
      sourceFilter: (path) => /^(web|obsidian-arrow|viewer)\/src\//.test(path),
    });
    for (const path of this.attachments) {
      const coverage = JSON.parse(await readFile(path, "utf8"));
      const bundles = [];
      for (const entry of coverage) {
        const bundle = bundlePath(entry.url);
        if (!bundle) continue;
        if (!this.sourceMaps.has(bundle)) {
          try {
            const sourceMap = JSON.parse(await readFile(`${bundle}.map`, "utf8"));
            sourceMap.sources = sourceMap.sources.map((source) => (
              pathToFileURL(resolve(dirname(bundle), source)).href
            ));
            this.sourceMaps.set(bundle, sourceMap);
          } catch (error) {
            // Some third-party chunks, including Mermaid, have no source map.
            if (error.code !== "ENOENT") throw error;
            this.sourceMaps.set(bundle, null);
          }
        }
        const sourceMap = this.sourceMaps.get(bundle);
        if (!sourceMap) continue;
        bundles.push({
          ...entry,
          url: pathToFileURL(bundle).href,
          sourceMap,
        });
      }
      if (bundles.length) await report.add(bundles);
    }

    await report.generate();
    const lcov = await readFile(resolve(output, "lcov.info"), "utf8");
    for (const module of ["web", "obsidian-arrow", "viewer"]) {
      if (!lcov.includes(`SF:${module}/src/`)) {
        throw new Error(`Browser coverage is missing source files for ${module}`);
      }
    }
  }
}
