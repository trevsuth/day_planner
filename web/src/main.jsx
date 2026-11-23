import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, ClipboardCheck, ClipboardList, FileText, FolderKanban, GitBranch, HelpCircle, Search } from "lucide-react";
import { ApiReference } from "./api-reference/ApiReference";
import { PlannerApp } from "./planner/PlannerApp";
import { ProjectsApp } from "./projects/ProjectsApp";
import { SearchApp } from "./search/SearchApp";
import { ShortcutReference } from "./shortcuts/ShortcutReference";
import { ValidationApp } from "./validation/ValidationApp";
import "./styles.css";

const views = [
  { id: "planner", href: "/", label: "Planner", Icon: CalendarDays },
  { id: "projects", href: "/?view=projects", label: "Projects", Icon: FolderKanban },
  { id: "graph", href: "/graph/", label: "Graph", Icon: GitBranch, separatePage: true },
  { id: "viewer", href: "/viewer/", label: "Viewer", Icon: FileText, separatePage: true },
  { id: "validation", href: "/?view=validation", label: "Validation", Icon: ClipboardCheck },
  { id: "search", href: "/?view=search", label: "Search", Icon: Search },
  { id: "api", href: "/?view=api", label: "API", Icon: ClipboardList },
];

function viewFromLocation() {
  const view = new URLSearchParams(window.location.search).get("view");
  return ["projects", "validation", "search", "api"].includes(view) ? view : "planner";
}

function App() {
  const [activeTab, setActiveTab] = useState(viewFromLocation);
  const [requestedCardId, setRequestedCardId] = useState(() => new URLSearchParams(location.search).get("card") || "");
  const [searchFocus, setSearchFocus] = useState(0);
  const [isShortcutReferenceOpen, setIsShortcutReferenceOpen] = useState(() => new URLSearchParams(window.location.search).get("shortcuts") === "1");

  useEffect(() => {
    function restoreView() {
      setActiveTab(viewFromLocation());
      setRequestedCardId(new URLSearchParams(location.search).get("card") || "");
    }
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);

  function openView(id) {
    if (id === activeTab) return;
    window.history.pushState(null, "", views.find((view) => view.id === id).href);
    setActiveTab(id);
  }

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyK") {
        event.preventDefault();
        openView("search");
        setSearchFocus((current) => current + 1);
        return;
      }
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (event.key === "Escape" && isShortcutReferenceOpen) {
        event.preventDefault();
        setIsShortcutReferenceOpen(false);
        return;
      }

      if (!isTyping && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === "?") {
        event.preventDefault();
        setIsShortcutReferenceOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, isShortcutReferenceOpen]);

  return (
    <main className="app-shell">
      <nav className="app-tabs" aria-label="Application views">
        {views.map((view) => (
          <a
            key={view.id}
            href={view.href}
            aria-current={activeTab === view.id ? "page" : undefined}
            onClick={(event) => {
              if (view.separatePage || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              event.preventDefault();
              openView(view.id);
            }}
          >
            <view.Icon size={18} aria-hidden="true" />
            <span>{view.label}</span>
          </a>
        ))}
        <button
          className="shortcut-help-button"
          type="button"
          onClick={() => setIsShortcutReferenceOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <HelpCircle size={18} />
          <span>Shortcuts</span>
        </button>
      </nav>

      {activeTab === "planner" ? (
        <PlannerApp
          onOpenLinkedCard={(cardId) => {
            setRequestedCardId(cardId);
            openView("projects");
          }}
        />
      ) : null}
      {activeTab === "projects" ? (
        <ProjectsApp
          requestedCardId={requestedCardId}
          onRequestedCardOpened={() => setRequestedCardId("")}
        />
      ) : null}
      {activeTab === "validation" ? <ValidationApp /> : null}
      {activeTab === "search" ? <SearchApp focusRequest={searchFocus} /> : null}
      {activeTab === "api" ? <ApiReference /> : null}
      {isShortcutReferenceOpen ? <ShortcutReference onClose={() => setIsShortcutReferenceOpen(false)} /> : null}
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
