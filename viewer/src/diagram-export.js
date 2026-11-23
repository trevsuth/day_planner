const MAX_PNG_DIMENSION = 4096;

export function saveFile(blob, filename) {
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

export function diagramExportControls({ image, svg, blob, number }) {
  const controls = document.createElement("div");
  controls.className = "diagram-export";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", `Export diagram ${number}`);
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
        saveFile(format === "svg" ? blob : await asPng(image, svg), `diagram-${number}.${format}`);
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
