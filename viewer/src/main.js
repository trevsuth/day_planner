import MarkdownIt from "markdown-it";
import plannerIcon from "lucide-static/icons/calendar-days.svg?raw";
import projectsIcon from "lucide-static/icons/folder-kanban.svg?raw";
import graphIcon from "lucide-static/icons/git-branch.svg?raw";
import viewerIcon from "lucide-static/icons/file-text.svg?raw";
import validationIcon from "lucide-static/icons/clipboard-check.svg?raw";
import shortcutsIcon from "lucide-static/icons/circle-help.svg?raw";
import apiIcon from "lucide-static/icons/clipboard-list.svg?raw";
import fileIcon from "lucide-static/icons/folder-open.svg?raw";
import sourceIcon from "lucide-static/icons/square-pen.svg?raw";
import previewIcon from "lucide-static/icons/scan-eye.svg?raw";
import expandIcon from "lucide-static/icons/maximize.svg?raw";
import restoreIcon from "lucide-static/icons/minimize.svg?raw";
import zoomInIcon from "lucide-static/icons/zoom-in.svg?raw";
import zoomOutIcon from "lucide-static/icons/zoom-out.svg?raw";
import handIcon from "lucide-static/icons/hand.svg?raw";
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

function activeDraft() {
  return mode.value === "mermaid" ? diagramType.value : "markdown";
}

function showDraft() {
  diagramControls.hidden = mode.value !== "mermaid";
  source.value = drafts.get(activeDraft()) ?? "";
  scheduleRender();
}

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
    mode.value = /\.(mmd|mermaid)$/i.test(selected.name) ? "mermaid" : "markdown";
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
