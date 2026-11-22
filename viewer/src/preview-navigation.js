const minZoom = 0.25;
const maxZoom = 4;
const zoomStep = 1.25;

export function enablePreviewNavigation(viewport, content, mode) {
  const zoomOut = document.querySelector("#zoom-out");
  const zoomIn = document.querySelector("#zoom-in");
  const zoomLevel = document.querySelector("#preview-zoom");
  const panButton = document.querySelector("#preview-pan");
  let zoom = 1;
  let drag = null;

  function syncWidth() {
    content.style.width = `${viewport.clientWidth}px`;
  }

  function setZoom(next, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
    const bounded = Math.min(maxZoom, Math.max(minZoom, next));
    const ratio = bounded / zoom;
    const left = (viewport.scrollLeft + x) * ratio - x;
    const top = (viewport.scrollTop + y) * ratio - y;

    zoom = bounded;
    content.style.zoom = zoom;
    viewport.scrollTo(left, top);
    zoomLevel.value = `${Math.round(zoom * 100)}%`;
    zoomIn.disabled = zoom >= maxZoom;
    zoomOut.disabled = zoom <= minZoom;
  }

  new ResizeObserver(syncWidth).observe(viewport);
  syncWidth();
  setZoom(1);

  zoomIn.addEventListener("click", () => setZoom(zoom * zoomStep));
  zoomOut.addEventListener("click", () => setZoom(zoom / zoomStep));
  document.querySelector("#preview-fit").addEventListener("click", () => {
    setZoom(1, 0, 0);
    if (mode.value === "mermaid" && content.querySelector(".diagram img")) {
      setZoom(Math.min(1, viewport.clientHeight / content.offsetHeight), 0, 0);
    }
    viewport.scrollTo(0, 0);
  });

  viewport.addEventListener("wheel", (event) => {
    if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;

    event.preventDefault();
    const bounds = viewport.getBoundingClientRect();
    const next = event.deltaY < 0 ? zoom * zoomStep : zoom / zoomStep;
    setZoom(next, event.clientX - bounds.left, event.clientY - bounds.top);
  }, { passive: false });

  panButton.addEventListener("click", () => {
    const active = viewport.classList.toggle("pan-enabled");
    panButton.setAttribute("aria-pressed", String(active));
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary || !viewport.classList.contains("pan-enabled")) return;

    event.preventDefault();
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("panning");
    drag = {
      x: event.clientX + viewport.scrollLeft,
      y: event.clientY + viewport.scrollTop,
    };
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!drag || !viewport.hasPointerCapture(event.pointerId)) return;

    viewport.scrollTo(drag.x - event.clientX, drag.y - event.clientY);
  });

  viewport.addEventListener("lostpointercapture", () => {
    drag = null;
    viewport.classList.remove("panning");
  });
}
