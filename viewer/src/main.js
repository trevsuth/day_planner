import MarkdownIt from "markdown-it";
import plannerIcon from "lucide-static/icons/calendar-days.svg?raw";
import projectsIcon from "lucide-static/icons/folder-kanban.svg?raw";
import graphIcon from "lucide-static/icons/git-branch.svg?raw";
import viewerIcon from "lucide-static/icons/file-text.svg?raw";
import validationIcon from "lucide-static/icons/clipboard-check.svg?raw";
import shortcutsIcon from "lucide-static/icons/circle-help.svg?raw";
import calculatorIcon from "lucide-static/icons/calculator.svg?raw";
import searchIcon from "lucide-static/icons/search.svg?raw";
import apiIcon from "lucide-static/icons/clipboard-list.svg?raw";
import fileIcon from "lucide-static/icons/folder-open.svg?raw";
import sourceIcon from "lucide-static/icons/square-pen.svg?raw";
import previewIcon from "lucide-static/icons/scan-eye.svg?raw";
import expandIcon from "lucide-static/icons/maximize.svg?raw";
import restoreIcon from "lucide-static/icons/minimize.svg?raw";
import zoomInIcon from "lucide-static/icons/zoom-in.svg?raw";
import zoomOutIcon from "lucide-static/icons/zoom-out.svg?raw";
import handIcon from "lucide-static/icons/hand.svg?raw";
import { diagramExportControls, exportDocument } from "./export.js";
import { codeFormats } from "./codes.js";
import { diagramExamples } from "./diagram-examples.js";
import { enablePreviewNavigation } from "./preview-navigation.js";
import "./styles.css";

const icons = {
  planner: plannerIcon,
  projects: projectsIcon,
  graph: graphIcon,
  viewer: viewerIcon,
  validation: validationIcon,
  api: apiIcon,
  calculator: calculatorIcon,
  search: searchIcon,
  shortcuts: shortcutsIcon,
  file: fileIcon,
  source: sourceIcon,
  preview: previewIcon,
  expand: expandIcon,
  zoomIn: zoomInIcon,
  zoomOut: zoomOutIcon,
  hand: handIcon,
};
for (const element of document.querySelectorAll("[data-icon]")) {
  element.innerHTML = icons[element.dataset.icon];
}

const source = document.querySelector("#source");
const mode = document.querySelector("#mode");
const diagramControls = document.querySelector("#diagram-controls");
const diagramType = document.querySelector("#diagram-type");
const file = document.querySelector("#file");
const preview = document.querySelector("#preview");
const workspace = document.querySelector("#viewer-workspace");
const sourcePane = document.querySelector("#source-pane");
const previewSize = document.querySelector("#preview-size");
const exportHtml = document.querySelector("#export-html");
const printPreview = document.querySelector("#print-preview");
const exportStatus = document.querySelector("#document-export-status");
const diagramBlobs = new WeakMap();
const standaloneExport = document.querySelector("#standalone-export");
const fileError = document.querySelector("#file-error");
const maxSourceSize = 100_000;
const drafts = new Map(diagramExamples.map(({ id, source }) => [id, source]));

for (const { id, label } of diagramExamples) {
  diagramType.add(new Option(label, id));
}

function setPreviewExpanded(expanded) {
  workspace.classList.toggle("preview-expanded", expanded);
  sourcePane.hidden = expanded;
  const action = expanded ? "Restore split view" : "Expand preview";
  previewSize.title = action;
  previewSize.setAttribute("aria-label", action);
  previewSize.firstElementChild.innerHTML = expanded ? restoreIcon : expandIcon;
}

previewSize.addEventListener("click", () => setPreviewExpanded(!sourcePane.hidden));
enablePreviewNavigation(document.querySelector("#preview-viewport"), preview, mode);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyK") {
    event.preventDefault();
    window.open("/?view=search", "_blank", "noopener");
    return;
  }
  if (event.key === "Escape" && sourcePane.hidden) {
    setPreviewExpanded(false);
    previewSize.focus();
  }
});

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
      theme: "base",
      themeVariables: {
        darkMode: true,
        background: "#0b141a",
        primaryColor: "#15313e",
        primaryTextColor: "#d8f6ff",
        primaryBorderColor: "#5bd2ea",
        lineColor: "#81a7b2",
        textColor: "#d8f6ff",
        edgeLabelBackground: "#0b141a",
      },
    });
    return mermaid;
  });
  return mermaidModule;
}

async function renderDiagram(container, version, number) {
  try {
    const mermaid = await loadMermaid();
    if (version !== renderVersion) return;
    const { svg } = await mermaid.render(`viewer-diagram-${++nextDiagramId}`, container.dataset.diagram);
    if (version !== renderVersion) return;
    showGraphic(container, svg, { number, alt: "Mermaid diagram" });
  } catch (error) {
    if (version === renderVersion) showRenderError(container, "diagram", error);
  }
}

function showGraphic(container, svg, { alt, ...options }) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  imageUrls.push(url);
  const image = new Image();
  image.src = url;
  image.alt = alt;
  diagramBlobs.set(image, blob);
  const controls = diagramExportControls({ image, svg, blob, ...options });
  container.replaceChildren(image);
  if (mode.value === "markdown") container.append(controls);
  else standaloneExport.replaceChildren(controls);
}

function showRenderError(container, label, error) {
  const message = document.createElement("p");
  message.className = "diagram-error";
  message.setAttribute("role", "alert");
  message.textContent = `Could not render ${label}. ${error.message ?? String(error)}`;
  container.replaceChildren(message);
}

async function render(version) {
  for (const url of imageUrls) URL.revokeObjectURL(url);
  imageUrls = [];
  const code = codeFormats[mode.value];
  if (!(code ? source.value : source.value.trim())) {
    preview.textContent = code ? `Enter text to generate a ${code.label}.` : "Enter source to see a preview.";
    return;
  }
  if (code) {
    const container = document.createElement("div");
    container.className = "diagram";
    preview.replaceChildren(container);
    try {
      const svg = await code.render(source.value);
      if (version !== renderVersion) return;
      showGraphic(container, svg, { alt: code.label, filename: code.filename, label: `Export ${code.label}` });
    } catch (error) {
      if (version === renderVersion) showRenderError(container, code.label, error);
    }
  } else if (mode.value === "mermaid") {
    const container = document.createElement("div");
    container.className = "diagram";
    container.dataset.diagram = source.value;
    preview.replaceChildren(container);
  } else {
    preview.innerHTML = markdown.render(source.value);
  }
  const diagrams = Array.from(preview.querySelectorAll(".diagram[data-diagram]"));
  for (const [index, container] of diagrams.entries()) {
    if (version !== renderVersion) return;
    await renderDiagram(container, version, index + 1);
  }
  if (version === renderVersion) {
    const exportable = mode.value === "markdown" || Boolean(preview.querySelector(".diagram img"));
    exportHtml.disabled = !exportable;
    printPreview.disabled = !exportable;
  }
}

function scheduleRender() {
  const version = ++renderVersion;
  clearTimeout(timer);
  standaloneExport.replaceChildren();
  exportHtml.disabled = true;
  printPreview.disabled = true;
  exportStatus.hidden = true;
  timer = setTimeout(() => render(version), 180);
}

function activeDraft() {
  return mode.value === "mermaid" ? diagramType.value : mode.value;
}

function showDraft() {
  diagramControls.hidden = mode.value !== "mermaid";
  source.placeholder = codeFormats[mode.value]?.placeholder ?? "Paste Markdown or Mermaid source";
  source.value = drafts.get(activeDraft()) ?? "";
  scheduleRender();
}

exportHtml.addEventListener("click", async () => {
  const version = renderVersion;
  exportHtml.disabled = true;
  exportStatus.hidden = true;
  try {
    await exportDocument(preview, diagramBlobs);
  } catch (error) {
    exportStatus.textContent = error.message || "Could not export the preview.";
    exportStatus.hidden = false;
  } finally {
    if (version === renderVersion) exportHtml.disabled = false;
  }
});
printPreview.addEventListener("click", () => window.print());

source.addEventListener("input", () => {
  drafts.set(activeDraft(), source.value);
  scheduleRender();
});
mode.addEventListener("change", showDraft);
diagramType.addEventListener("change", showDraft);
file.addEventListener("change", async () => {
  const selected = file.files[0];
  file.value = "";
  if (!selected) return;
  fileError.hidden = true;
  try {
    const content = await selected.text();
    if (content.length > maxSourceSize) throw new Error("Choose a file with 100,000 characters or fewer.");
    if (!codeFormats[mode.value]) mode.value = /\.(mmd|mermaid)$/i.test(selected.name) ? "mermaid" : "markdown";
    if (mode.value === "mermaid") {
      if (!drafts.has("file")) diagramType.add(new Option("Opened diagram", "file"));
      diagramType.value = "file";
    }
    drafts.set(activeDraft(), content);
    showDraft();
  } catch (error) {
    fileError.textContent = error.message;
    fileError.hidden = false;
  }
});

showDraft();
