import { saveFile } from "./diagram-export.js";

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
