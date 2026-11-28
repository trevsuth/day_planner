import { writeFile } from "node:fs/promises";
import { test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!process.env.PLAYWRIGHT_COVERAGE) {
      await use(page);
      return;
    }

    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    try {
      await use(page);
    } finally {
      const coverage = await page.coverage.stopJSCoverage();
      const path = testInfo.outputPath("browser-coverage.json");
      await writeFile(path, JSON.stringify(coverage));
      await testInfo.attach("browser-coverage", { path, contentType: "application/json" });
    }
  },
});
