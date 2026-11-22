import MarkdownIt from "markdown-it";
import "./styles.css";

const source = document.querySelector("#source");
const mode = document.querySelector("#mode");
const file = document.querySelector("#file");
const preview = document.querySelector("#preview");
const fileError = document.querySelector("#file-error");
const maxSourceSize = 100_000;

const markdown = new MarkdownIt({ html: false, linkify: true });
const renderFence = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  if (/^(mermaid|mmd)(\s|$)/i.test(token.info.trim())) {
    return `<div class="diagram" data-diagram="${markdown.utils.escapeHtml(token.content)}"></div>`;
  }
  return renderFence(tokens, index, options, env, renderer);
};

let mermaidModule;
let timer;
let renderVersion = 0;
let nextDiagramId = 0;
let imageUrls = [];

function loadMermaid() {
  mermaidModule ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      theme: "neutral",
    });
    return mermaid;
  });
  return mermaidModule;
}

async function renderDiagram(container, version) {
  try {
    const mermaid = await loadMermaid();
    if (version !== renderVersion) return;
    const { svg } = await mermaid.render(`viewer-diagram-${++nextDiagramId}`, container.dataset.diagram);
    if (version !== renderVersion) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    imageUrls.push(url);
    const image = new Image();
    image.src = url;
    image.alt = "Mermaid diagram";
    container.replaceChildren(image);
  } catch (error) {
    if (version !== renderVersion) return;
    const message = document.createElement("p");
    message.className = "diagram-error";
    message.setAttribute("role", "alert");
    message.textContent = `Could not render diagram. ${error.message ?? String(error)}`;
    container.replaceChildren(message);
  }
}

async function render(version) {
  for (const url of imageUrls) URL.revokeObjectURL(url);
  imageUrls = [];
  if (!source.value.trim()) {
    preview.textContent = "Enter source to see a preview.";
    return;
  }
  if (mode.value === "mermaid") {
    const container = document.createElement("div");
    container.className = "diagram";
    container.dataset.diagram = source.value;
    preview.replaceChildren(container);
  } else {
    preview.innerHTML = markdown.render(source.value);
  }
  for (const container of preview.querySelectorAll(".diagram[data-diagram]")) {
    if (version !== renderVersion) return;
    await renderDiagram(container, version);
  }
}

function scheduleRender() {
  const version = ++renderVersion;
  clearTimeout(timer);
  timer = setTimeout(() => render(version), 180);
}

source.addEventListener("input", scheduleRender);
mode.addEventListener("change", scheduleRender);
file.addEventListener("change", async () => {
  const selected = file.files[0];
  file.value = "";
  if (!selected) return;
  fileError.hidden = true;
  try {
    const content = await selected.text();
    if (content.length > maxSourceSize) throw new Error("Choose a file with 100,000 characters or fewer.");
    mode.value = /\.(mmd|mermaid)$/i.test(selected.name) ? "mermaid" : "markdown";
    source.value = content;
    scheduleRender();
  } catch (error) {
    fileError.textContent = error.message;
    fileError.hidden = false;
  }
});

scheduleRender();
