const MAX_PNG_DIMENSION = 4096;

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function asPng(image, svg) {
  await image.decode();
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  const dimensions = parsed.documentElement.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const width = dimensions?.[2] || image.naturalWidth;
  const height = dimensions?.[3] || image.naturalHeight;
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    throw new Error("The diagram has no exportable dimensions.");
  }
  const scale = Math.min(2, MAX_PNG_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser cannot create a PNG canvas.");
  context.fillStyle = "#0b141a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the diagram as PNG."));
    }, "image/png");
  });
}

export function diagramExportControls({ image, svg, blob, number, filename = `diagram-${number}`, label = `Export diagram ${number}` }) {
  const controls = document.createElement("div");
  controls.className = "diagram-export";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", label);
  const status = document.createElement("span");
  status.setAttribute("role", "status");

  for (const format of ["svg", "png"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preview-size";
    button.textContent = `Download ${format.toUpperCase()}`;
    button.addEventListener("click", async () => {
      button.disabled = true;
      status.textContent = "";
      try {
        saveFile(format === "svg" ? blob : await asPng(image, svg), `${filename}.${format}`);
      } catch (error) {
        status.textContent = error.message || "Could not download the diagram.";
      } finally {
        button.disabled = false;
      }
    });
    controls.append(button);
  }
  controls.append(status);
  return controls;
}

function imageDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportDocument(preview, diagramBlobs) {
  const copy = preview.cloneNode(true);
  copy.querySelectorAll(".diagram-export").forEach((controls) => controls.remove());
  const originalImages = Array.from(preview.querySelectorAll("img"));
  const copies = Array.from(copy.querySelectorAll("img"));
  await Promise.all(copies.map(async (image, index) => {
    const blob = diagramBlobs.get(originalImages[index]);
    if (blob) {
      image.src = await imageDataUrl(blob);
      image.removeAttribute("srcset");
    } else {
      image.replaceWith(document.createTextNode(image.alt));
    }
  }));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Day Planner Viewer export</title>
<style>
body { max-width: 75ch; padding: 1.5rem; margin: auto; font: 1rem/1.6 system-ui, sans-serif; color: #18252d; }
img { max-width: 100%; height: auto; background: #0b141a; }
pre { overflow: auto; padding: 1em; background: #edf2f4; }
td, th { border: 1px solid #a7b4bd; padding: .4em .6em; }
table { border-collapse: collapse; }
.diagram { break-inside: avoid; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
</style></head><body>${copy.innerHTML}</body></html>`;
  saveFile(new Blob([html], { type: "text/html;charset=utf-8" }), "viewer-export.html");
}
