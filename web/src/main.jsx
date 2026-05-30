import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileText,
  GitBranch,
  FolderKanban,
  Link2,
  ListChecks,
  Map as MapIcon,
  NotebookPen,
  Plus,
  Save,
  Star,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import { request } from "./api/client";
import {
  activityFieldLabels,
  CARD_TYPES,
  cardTypeLabels,
  childTypeByCardType,
  defaultProjectFilters,
  parentTypeByCardType,
  PRIORITY_COUNT,
  projectCardCsvHeaders,
  PROJECT_VIEWS,
  STATUSES,
  statusLabels,
} from "./domain/constants";
import {
  allCardIssues,
  cardCanChangeType,
  cardMatchesFilters,
  cardPayload,
  cardRelationshipLabel,
  collectDescendants,
  dependencyCardsFor,
  dependencyDependentsFor,
  dependencyEdgesForCards,
  emptyCard,
  formatActivityValue,
  ganttScheduleForCard,
  getHierarchyRows,
  getScheduleBounds,
  getScheduledCards,
  getTimelinePoints,
  hierarchyShiftForCard,
  isOverdue,
  projectIssuesForCards,
  sortCardsForRoadmap,
  summarizeCards,
} from "./domain/cards";
import {
  csvHeaderMap,
  csvValue,
  downloadCsv,
  normalizeCardStatus,
  normalizeCardType,
  parseCsv,
  safeFilePart,
  splitCsvList,
} from "./domain/csv";
import {
  addDays,
  daysBetween,
  displayDate,
  formatDateInput,
  formatDateTime,
  parseLocalDate,
} from "./domain/dates";
import { compactEntry, normalizeEntry, plannerPriorityText } from "./domain/planner";
import "./styles.css";

const PROJECT_STATE_STORAGE_KEY = "dailyPlanner.projectState";

function loadStoredProjectState() {
  try {
    return JSON.parse(window.localStorage.getItem(PROJECT_STATE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownToHtml(value = "") {
  const lines = value.split("\n");
  const html = [];
  let listItems = [];
  let codeFence = null;
  let codeLines = [];

  function flushList() {
    if (!listItems.length) return;
    html.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  function flushCode() {
    const escapedCode = escapeHtml(codeLines.join("\n"));
    if (codeFence === "mermaid" || codeFence === "mmd") {
      html.push(`<div class="mermaid-preview"><span>${codeFence.toUpperCase()}</span><pre>${escapedCode}</pre></div>`);
    } else {
      html.push(`<pre><code>${escapedCode}</code></pre>`);
    }
    codeFence = null;
    codeLines = [];
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch && codeFence) {
      flushCode();
      continue;
    }
    if (fenceMatch) {
      flushList();
      codeFence = (fenceMatch[1] || "text").toLowerCase();
      continue;
    }
    if (codeFence) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      html.push(`<h${headingMatch[1].length}>${inlineMarkdown(headingMatch[2])}</h${headingMatch[1].length}>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  flushList();
  if (codeFence) flushCode();
  return html.join("");
}

function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function Section({ icon, title, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        {icon}
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("planner");
  const [requestedCardId, setRequestedCardId] = useState("");

  return (
    <main className="app-shell">
      <nav className="app-tabs" aria-label="Application views">
        <button
          className={activeTab === "planner" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("planner")}
        >
          <CalendarDays size={18} />
          <span>Planner</span>
        </button>
        <button
          className={activeTab === "projects" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("projects")}
        >
          <FolderKanban size={18} />
          <span>Projects</span>
        </button>
        <button
          className={activeTab === "api" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("api")}
        >
          <ClipboardList size={18} />
          <span>API</span>
        </button>
      </nav>

      {activeTab === "planner" ? (
        <PlannerApp
          onOpenLinkedCard={(cardId) => {
            setRequestedCardId(cardId);
            setActiveTab("projects");
          }}
        />
      ) : null}
      {activeTab === "projects" ? (
        <ProjectsApp
          requestedCardId={requestedCardId}
          onRequestedCardOpened={() => setRequestedCardId("")}
        />
      ) : null}
      {activeTab === "api" ? <ApiReference /> : null}
    </main>
  );
}

function PlannerApp({ onOpenLinkedCard }) {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [entryDate, setEntryDate] = useState(today);
  const [entry, setEntry] = useState(() => normalizeEntry({}, today));
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [linkedCards, setLinkedCards] = useState({});
  const entryRef = useRef(entry);
  const entryDateRef = useRef(entryDate);
  const changeVersionRef = useRef(0);
  const saveInFlightRef = useRef(null);
  const savedStatusTimeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    entryDateRef.current = entryDate;

    async function loadEntry() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetch(`/api/planner/entries/${entryDate}`);
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          const nextEntry = normalizeEntry(data, entryDate);
          entryRef.current = nextEntry;
          setEntry(nextEntry);
          setIsDirty(false);
          setStatus("idle");
        }
      } catch (err) {
        if (!cancelled) {
          const nextEntry = normalizeEntry({}, entryDate);
          entryRef.current = nextEntry;
          setEntry(nextEntry);
          setIsDirty(false);
          setError("Could not load this planner entry.");
          setStatus("error");
        }
      }
    }

    loadEntry();
    return () => {
      cancelled = true;
    };
  }, [entryDate]);

  useEffect(() => {
    let cancelled = false;
    const cardIds = [...new Set(entry.priority_card_ids.filter(Boolean))];
    if (!cardIds.length) {
      setLinkedCards({});
      return undefined;
    }

    async function loadLinkedCards() {
      const linkedEntries = await Promise.all(
        cardIds.map(async (cardId) => {
          const response = await fetch(`/api/projmgmt/cards/${cardId}`);
          return [cardId, response.ok ? await response.json() : null];
        }),
      );
      if (!cancelled) setLinkedCards(Object.fromEntries(linkedEntries));
    }

    loadLinkedCards();
    return () => {
      cancelled = true;
    };
  }, [entry.priority_card_ids.join("|")]);

  useEffect(() => {
    if (!isDirty || status === "loading" || status === "saving" || status === "error") return undefined;
    const timeout = window.setTimeout(() => {
      saveEntry();
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [entry, entryDate, isDirty, status]);

  useEffect(
    () => () => {
      if (savedStatusTimeoutRef.current) {
        window.clearTimeout(savedStatusTimeoutRef.current);
      }
    },
    [],
  );

  function updateEntry(updater) {
    setEntry((current) => {
      const nextEntry = updater({ ...current });
      entryRef.current = nextEntry;
      return nextEntry;
    });
    changeVersionRef.current += 1;
    setIsDirty(true);
    setError("");
    setStatus((current) => (current === "saved" || current === "error" ? "idle" : current));
  }

  async function saveEntry() {
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }

    const dateToSave = entryDateRef.current;
    const versionToSave = changeVersionRef.current;
    const payload = compactEntry(entryRef.current);
    setStatus("saving");
    setError("");

    try {
      const request = fetch(`/api/planner/entries/${dateToSave}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      saveInFlightRef.current = request;
      const response = await request;
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const data = await response.json();
      if (dateToSave === entryDateRef.current && versionToSave === changeVersionRef.current) {
        const nextEntry = normalizeEntry(data, dateToSave);
        entryRef.current = nextEntry;
        setEntry(nextEntry);
        setIsDirty(false);
        setStatus("saved");
        if (savedStatusTimeoutRef.current) {
          window.clearTimeout(savedStatusTimeoutRef.current);
        }
        savedStatusTimeoutRef.current = window.setTimeout(
          () => setStatus((current) => (current === "saved" ? "idle" : current)),
          1500,
        );
      } else {
        setStatus("idle");
      }
      return true;
    } catch (err) {
      setStatus("error");
      setError("Could not save this planner entry.");
      return false;
    } finally {
      saveInFlightRef.current = null;
    }
  }

  async function moveDay(amount) {
    if (status === "loading") return;
    if (isDirty && !(await saveEntry())) return;
    setEntryDate((current) => addDays(current, amount));
  }

  async function selectDate(nextDate) {
    if (nextDate === entryDate) return;
    if (isDirty && !(await saveEntry())) return;
    setEntryDate(nextDate);
  }

  async function removeCardAssignment(cardId) {
    const response = await fetch(`/api/planner/card-assignments/${cardId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("Could not remove card assignment.");
      return;
    }
    const nextEntry = normalizeEntry(
      {
        ...entryRef.current,
        priorities: entryRef.current.priorities.filter(
          (_, index) => entryRef.current.priority_card_ids[index] !== cardId,
        ),
        priority_card_ids: entryRef.current.priority_card_ids.filter(
          (linkedCardId) => linkedCardId !== cardId,
        ),
      },
      entryDate,
    );
    entryRef.current = nextEntry;
    setEntry(nextEntry);
    setIsDirty(false);
    setStatus("saved");
  }

  const statusLabel =
    status === "loading"
      ? "Loading"
      : status === "saving"
        ? "Saving"
        : status === "saved"
          ? "Saved"
          : isDirty
            ? "Unsaved changes"
          : error
            ? "Offline"
            : "Ready";

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">
            <CalendarDays size={16} />
            <span>Daily Planner</span>
          </div>
          <h1>{displayDate(entryDate)}</h1>
        </div>

        <div className="date-controls">
          <IconButton label="Previous day" onClick={() => moveDay(-1)}>
            <ChevronLeft size={20} />
          </IconButton>
          <input
            aria-label="Planner date"
            type="date"
            value={entryDate}
            onChange={(event) => selectDate(event.target.value)}
          />
          <IconButton label="Next day" onClick={() => moveDay(1)}>
            <ChevronRight size={20} />
          </IconButton>
          <button className="save-button" type="button" onClick={saveEntry} disabled={status === "saving"}>
            <Save size={18} />
            <span>Save</span>
          </button>
        </div>
      </header>

      <StatusLine error={error} label={error || statusLabel} />

      <div className="planner-grid">
        <Section icon={<ClipboardList size={20} />} title="Schedule" className="schedule-panel">
          <textarea
            value={entry.schedule}
            onChange={(event) =>
              updateEntry((current) => ({
                ...current,
                schedule: event.target.value,
              }))
            }
            placeholder="Plan the shape of the day..."
          />
        </Section>

        <Section icon={<Star size={20} />} title="Priorities">
          <div className="priority-list">
            {entry.priorities.map((priority, index) => {
              const linkedCardId = entry.priority_card_ids[index];
              const linkedCard = linkedCardId ? linkedCards[linkedCardId] : null;
              return (
              <div className="priority-row" key={index}>
                <span className="priority-index">{index + 1}</span>
                <input
                  value={priority}
                  onChange={(event) =>
                    updateEntry((current) => {
                      const priorities = [...current.priorities];
                      const priorityCardIds = [...current.priority_card_ids];
                      priorities[index] = event.target.value;
                      priorityCardIds[index] = null;
                      return { ...current, priorities, priority_card_ids: priorityCardIds };
                    })
                  }
                  placeholder="Priority"
                />
                {linkedCardId ? (
                  <div className="priority-link-actions">
                    <button
                      className="priority-link-button"
                      type="button"
                      disabled={!linkedCard}
                      onClick={() => onOpenLinkedCard(linkedCardId)}
                      title={linkedCard ? `Open ${linkedCard.title}` : "Linked card is unavailable"}
                    >
                      <Link2 size={15} />
                      <span>{linkedCard ? "Card" : "Missing"}</span>
                    </button>
                    <IconButton label="Remove card assignment" onClick={() => removeCardAssignment(linkedCardId)}>
                      <Unlink size={16} />
                    </IconButton>
                  </div>
                ) : null}
              </div>
            )})}
          </div>
        </Section>

        <Section icon={<ListChecks size={20} />} title="Tasks">
          <div className="task-list">
            {entry.tasks.map((task, index) => (
              <label className="task-row" key={index}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={(event) =>
                    updateEntry((current) => {
                      const tasks = [...current.tasks];
                      tasks[index] = { ...tasks[index], completed: event.target.checked };
                      return { ...current, tasks };
                    })
                  }
                />
                <input
                  value={task.text}
                  onChange={(event) =>
                    updateEntry((current) => {
                      const tasks = [...current.tasks];
                      tasks[index] = { ...tasks[index], text: event.target.value };
                      return { ...current, tasks };
                    })
                  }
                  placeholder={`Task ${index + 1}`}
                />
              </label>
            ))}
          </div>
        </Section>

        <Section icon={<NotebookPen size={20} />} title="Notes" className="notes-panel">
          <textarea
            value={entry.notes}
            onChange={(event) =>
              updateEntry((current) => ({
                ...current,
                notes: event.target.value,
              }))
            }
            placeholder="Notes, reflections, reminders..."
          />
        </Section>
      </div>
    </>
  );
}

function ProjectsApp({ onRequestedCardOpened, requestedCardId }) {
  const storedProjectState = useMemo(loadStoredProjectState, []);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(storedProjectState.activeProjectId || "");
  const [cards, setCards] = useState([]);
  const [projectCardsById, setProjectCardsById] = useState({});
  const [cardActivityById, setCardActivityById] = useState({});
  const [projectView, setProjectView] = useState(
    PROJECT_VIEWS.includes(storedProjectState.projectView) ? storedProjectState.projectView : "portfolio",
  );
  const [projectFilters, setProjectFilters] = useState({
    ...defaultProjectFilters,
    ...(storedProjectState.projectFilters || {}),
  });
  const [keyboardCardId, setKeyboardCardId] = useState("");
  const [draftProject, setDraftProject] = useState({ name: "", description: "" });
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [previewCard, setPreviewCard] = useState(null);
  const [selectedBulkCardIds, setSelectedBulkCardIds] = useState([]);
  const [bulkDraft, setBulkDraft] = useState({
    status: "",
    start_date: "",
    due_date: "",
    card_type: "",
  });
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(Boolean(storedProjectState.isProjectSwitcherOpen));
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(Boolean(storedProjectState.isFilterPanelOpen));
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(Boolean(storedProjectState.isBulkEditOpen));
  const [isCsvMenuOpen, setIsCsvMenuOpen] = useState(false);
  const [status, setStatus] = useState("Loading");
  const [error, setError] = useState("");
  const projectNameInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const csvUploadInputRef = useRef(null);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const selectedCardId = selectedCard?.id || "";
  const selectedCardActivity = selectedCardId ? cardActivityById[selectedCardId] || [] : [];
  const previewCardId = previewCard?.id || "";
  const filteredCards = cards.filter((card) => cardMatchesFilters(card, projectFilters));
  const selectedBulkCards = cards.filter((card) => selectedBulkCardIds.includes(card.id));
  const activeProjectSummary = summarizeCards(cards);
  const activeProjectIssueCount = projectIssuesForCards(cards).length;
  const filteredProjectCardsById = Object.fromEntries(
    Object.entries(projectCardsById).map(([projectId, projectCards]) => [
      projectId,
      projectCards.filter((card) => cardMatchesFilters(card, projectFilters)),
    ]),
  );
  const filteredCardIds = filteredCards.map((card) => card.id).join("|");
  const hasActiveFilters =
    projectFilters.query ||
    projectFilters.cardTypes.length ||
    projectFilters.statuses.length ||
    projectFilters.schedule !== "all";

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!requestedCardId) return;
    async function openRequestedCard() {
      try {
        const card = await request(`/api/projmgmt/cards/${requestedCardId}`);
        setActiveProjectId(card.project_id);
        setPreviewCard(card);
      } catch (err) {
        setError("Linked project card is no longer available.");
      } finally {
        onRequestedCardOpened();
      }
    }
    openRequestedCard();
  }, [requestedCardId]);

  useEffect(() => {
    if (activeProjectId) {
      loadCards(activeProjectId);
    } else {
      setCards([]);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (selectedCardId) {
      loadCardActivity(selectedCardId);
    }
  }, [selectedCardId]);

  useEffect(() => {
    window.localStorage.setItem(
      PROJECT_STATE_STORAGE_KEY,
      JSON.stringify({
        activeProjectId,
        projectView,
        projectFilters,
        isProjectSwitcherOpen,
        isFilterPanelOpen,
        isBulkEditOpen,
      }),
    );
  }, [activeProjectId, isBulkEditOpen, isFilterPanelOpen, isProjectSwitcherOpen, projectFilters, projectView]);

  useEffect(() => {
    if (!previewCardId) return;
    const updatedCard = cards.find((card) => card.id === previewCardId);
    if (updatedCard) {
      setPreviewCard(updatedCard);
    } else if (cards.length && previewCard?.project_id === activeProjectId) {
      setPreviewCard(null);
    }
  }, [activeProjectId, cards, previewCard, previewCardId]);

  useEffect(() => {
    setSelectedBulkCardIds((current) => current.filter((cardId) => cards.some((card) => card.id === cardId)));
  }, [cards]);

  useEffect(() => {
    if (!filteredCards.length) {
      setKeyboardCardId("");
      return;
    }

    setKeyboardCardId((current) =>
      filteredCards.some((card) => card.id === current) ? current : filteredCards[0].id,
    );
  }, [filteredCardIds]);

  useEffect(() => {
    function onKeyDown(event) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (selectedProject) {
        if (event.key === "Escape") {
          event.preventDefault();
          setSelectedProject(null);
        } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          saveSelectedProject();
        }
        return;
      }

      if (selectedCard) {
        if (event.key === "Escape") {
          event.preventDefault();
          setSelectedCard(null);
        } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          saveSelectedCard();
        }
        return;
      }

      const key = event.key.toLowerCase();

      if (!isTyping && !event.altKey && key === "/") {
        event.preventDefault();
        setIsFilterPanelOpen(true);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }

      if (!isTyping && !event.altKey && (key === "j" || event.key === "ArrowDown")) {
        event.preventDefault();
        selectAdjacentCard(1);
        return;
      }

      if (!isTyping && !event.altKey && (key === "k" || event.key === "ArrowUp")) {
        event.preventDefault();
        selectAdjacentCard(-1);
        return;
      }

      if (!isTyping && !event.altKey && event.key === "Enter") {
        event.preventDefault();
        openKeyboardCard();
        return;
      }

      if (isTyping || !event.altKey) return;

      if (key === "n") {
        event.preventDefault();
        setIsProjectSwitcherOpen(true);
        projectNameInputRef.current?.focus();
      } else if (key === "c") {
        event.preventDefault();
        startNewCard();
      } else if (key === "p") {
        event.preventDefault();
        if (activeProject) openProjectCard(activeProject);
      } else if (key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        selectAdjacentProject(1);
      } else if (key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        selectAdjacentProject(-1);
      } else if (PROJECT_VIEWS[Number(key) - 1]) {
        event.preventDefault();
        setProjectView(PROJECT_VIEWS[Number(key) - 1]);
      } else if (key === "0") {
        event.preventDefault();
        clearProjectFilters();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeProject,
    activeProjectId,
    filteredCardIds,
    keyboardCardId,
    projectView,
    projects,
    selectedCard,
    selectedProject,
  ]);

  useEffect(() => {
    if (isProjectSwitcherOpen) {
      projectNameInputRef.current?.focus();
    }
  }, [isProjectSwitcherOpen]);

  async function loadProjects() {
    setError("");
    try {
      const data = await request("/api/projmgmt/projects");
      setProjects(data);
      setActiveProjectId((current) => (data.some((project) => project.id === current) ? current : data[0]?.id || ""));
      await refreshProjectCardCache(data);
      setStatus("Ready");
    } catch (err) {
      setError("Could not load projects.");
      setStatus("Offline");
    }
  }

  async function refreshProjectCardCache(projectList = projects) {
    if (!projectList.length) {
      setProjectCardsById({});
      return;
    }

    const entries = await Promise.all(
      projectList.map(async (project) => {
        const projectCards = await request(`/api/projmgmt/projects/${project.id}/cards`);
        return [project.id, projectCards];
      }),
    );
    setProjectCardsById(Object.fromEntries(entries));
  }

  async function loadCards(projectId) {
    setError("");
    try {
      const data = await request(`/api/projmgmt/projects/${projectId}/cards`);
      setCards(data);
      setProjectCardsById((current) => ({ ...current, [projectId]: data }));
      setStatus("Ready");
    } catch (err) {
      setError("Could not load project cards.");
      setStatus("Offline");
    }
  }

  async function loadCardActivity(cardId) {
    try {
      const data = await request(`/api/projmgmt/cards/${cardId}/activity`);
      setCardActivityById((current) => ({ ...current, [cardId]: data }));
    } catch (err) {
      setError("Could not load card activity.");
    }
  }

  async function createProject(event) {
    event.preventDefault();
    if (!draftProject.name.trim()) return;

    const project = await request("/api/projmgmt/projects", {
      method: "POST",
      body: JSON.stringify({
        name: draftProject.name.trim(),
        description: draftProject.description.trim() || null,
      }),
    });
    setProjects((current) => [project, ...current]);
    setProjectCardsById((current) => ({ ...current, [project.id]: [] }));
    setActiveProjectId(project.id);
    setDraftProject({ name: "", description: "" });
    setError("");
  }

  function openProjectCard(project) {
    setActiveProjectId(project.id);
    setSelectedProject({ ...project });
    setSelectedCard(null);
  }

  async function saveSelectedProject(event) {
    event?.preventDefault();
    if (!selectedProject?.name.trim()) return;

    try {
      const saved = await request(`/api/projmgmt/projects/${selectedProject.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: selectedProject.name.trim(),
          description: selectedProject.description?.trim() || null,
        }),
      });
      setProjects((current) => current.map((project) => (project.id === saved.id ? saved : project)));
      setActiveProjectId(saved.id);
      setSelectedProject(null);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteProject(project) {
    const confirmed = window.confirm(
      `Delete "${project.name}" and all of its project cards? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      await request(`/api/projmgmt/projects/${project.id}`, { method: "DELETE" });
      setProjects((current) => {
        const remaining = current.filter((item) => item.id !== project.id);
        if (project.id === activeProjectId) {
          setActiveProjectId(remaining[0]?.id || "");
          setSelectedCard(null);
          setSelectedProject(null);
          setPreviewCard(null);
        }
        return remaining;
      });
      setProjectCardsById((current) => {
        const next = { ...current };
        delete next[project.id];
        return next;
      });
      setCards((current) => (project.id === activeProjectId ? [] : current));
      setError("");
      setStatus("Project deleted");
    } catch (err) {
      setError(err.message);
    }
  }

  function startNewCard(type = "epic", statusValue = "backlog", parentId = "") {
    if (!activeProjectId) return;
    setSelectedCard({ ...emptyCard(activeProjectId), card_type: type, status: statusValue, parent_id: parentId });
  }

  function updateProjectFilter(field, value) {
    setProjectFilters((current) => ({ ...current, [field]: value }));
  }

  function toggleProjectFilter(field, value) {
    setProjectFilters((current) => {
      const values = current[field];
      return {
        ...current,
        [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      };
    });
  }

  function clearProjectFilters() {
    setProjectFilters({
      query: "",
      cardTypes: [],
      statuses: [],
      schedule: "all",
    });
  }

  function selectAdjacentCard(direction) {
    if (!filteredCards.length) return;
    const currentIndex = Math.max(
      filteredCards.findIndex((card) => card.id === keyboardCardId),
      0,
    );
    const nextIndex = (currentIndex + direction + filteredCards.length) % filteredCards.length;
    setKeyboardCardId(filteredCards[nextIndex].id);
  }

  function openKeyboardCard() {
    const card = filteredCards.find((candidate) => candidate.id === keyboardCardId) || filteredCards[0];
    if (card) setPreviewCard(card);
  }

  function updateCardsAfterSave(savedCards) {
    setCards((current) =>
      current.map((card) => savedCards.find((saved) => saved.id === card.id) || card),
    );
    setProjectCardsById((current) => {
      const next = { ...current };
      for (const saved of savedCards) {
        next[saved.project_id] = (next[saved.project_id] || []).map((card) => (card.id === saved.id ? saved : card));
      }
      return next;
    });
    setPreviewCard((current) => (current ? savedCards.find((saved) => saved.id === current.id) || current : current));
  }

  function toggleBulkCard(cardId) {
    setSelectedBulkCardIds((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId],
    );
  }

  function selectAllFilteredCards() {
    setSelectedBulkCardIds(filteredCards.map((card) => card.id));
  }

  async function applyBulkEdits() {
    const targetCards = selectedBulkCards.length ? selectedBulkCards : filteredCards;
    if (!targetCards.length) return;

    const updates = {};
    if (bulkDraft.status) updates.status = bulkDraft.status;
    if (bulkDraft.start_date) updates.start_date = bulkDraft.start_date;
    if (bulkDraft.due_date) updates.due_date = bulkDraft.due_date;
    if (bulkDraft.card_type) updates.card_type = bulkDraft.card_type;
    if (!Object.keys(updates).length) return;

    const eligibleCards = updates.card_type
      ? targetCards.filter((card) => cardCanChangeType(card, updates.card_type, cards))
      : targetCards;
    if (!eligibleCards.length) {
      setError("No selected cards can be changed to that type with the current hierarchy.");
      return;
    }

    try {
      const savedCards = [];
      for (const card of eligibleCards) {
        const saved = await request(`/api/projmgmt/cards/${card.id}`, {
          method: "PUT",
          body: JSON.stringify(cardPayload(card, updates)),
        });
        savedCards.push(saved);
      }
      updateCardsAfterSave(savedCards);
      setBulkDraft({ status: "", start_date: "", due_date: "", card_type: "" });
      setError("");
      setStatus(`Updated ${savedCards.length} card${savedCards.length === 1 ? "" : "s"}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function savePreviewDates(card, dates) {
    if (dates.start_date && dates.due_date && dates.start_date > dates.due_date) {
      setError("Start date must be on or before due date.");
      return false;
    }

    try {
      const saved = await request(`/api/projmgmt/cards/${card.id}`, {
        method: "PUT",
        body: JSON.stringify(
          cardPayload(card, {
            start_date: dates.start_date || null,
            due_date: dates.due_date || null,
          }),
        ),
      });
      updateCardsAfterSave([saved]);
      setError("");
      setStatus("Schedule updated");
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function saveCard(event) {
    event?.preventDefault();
    await saveSelectedCard();
  }

  async function createInlineCard({ parent = null, project = null, title }) {
    const childType = parent ? childTypeByCardType[parent.card_type] : "epic";
    const projectId = parent?.project_id || project?.id || activeProjectId;
    if (!childType || !projectId || !title.trim()) return;

    try {
      const saved = await request("/api/projmgmt/cards", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          card_type: childType,
          title: title.trim(),
          description: null,
          comments: null,
          status: parent?.status || "backlog",
          start_date: null,
          due_date: null,
          parent_id: parent?.id || null,
          dependency_ids: [],
          deliverables: [],
        }),
      });

      setCards((current) => [...current, saved]);
      setProjectCardsById((current) => ({
        ...current,
        [projectId]: [...(current[projectId] || []), saved],
      }));
      setError("");
      return saved;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  async function saveSelectedCard() {
    if (!selectedCard?.title.trim()) return;
    if (selectedCard.start_date && selectedCard.due_date && selectedCard.start_date > selectedCard.due_date) {
      setError("Start date must be on or before due date.");
      return;
    }

    const savedCard = selectedCard.id ? cards.find((card) => card.id === selectedCard.id) : null;
    const hierarchyChanged = Boolean(savedCard && savedCard.card_type !== selectedCard.card_type);
    const payload = {
      card_type: selectedCard.card_type,
      title: selectedCard.title.trim(),
      description: selectedCard.description?.trim() || null,
      comments: selectedCard.comments?.trim() || null,
      status: selectedCard.status,
      start_date: selectedCard.start_date || null,
      due_date: selectedCard.due_date || null,
      parent_id: selectedCard.parent_id || null,
      dependency_ids: selectedCard.dependency_ids || [],
      deliverables: selectedCard.deliverables.map((item) => item.trim()).filter(Boolean),
    };

    try {
      const saved = selectedCard.id
        ? await request(`/api/projmgmt/cards/${selectedCard.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await request("/api/projmgmt/cards", {
            method: "POST",
            body: JSON.stringify({ ...payload, project_id: activeProjectId }),
          });

      setCards((current) => {
        const exists = current.some((card) => card.id === saved.id);
        return exists ? current.map((card) => (card.id === saved.id ? saved : card)) : [...current, saved];
      });
      setProjectCardsById((current) => {
        const projectCards = current[saved.project_id] || [];
        const exists = projectCards.some((card) => card.id === saved.id);
        return {
          ...current,
          [saved.project_id]: exists
            ? projectCards.map((card) => (card.id === saved.id ? saved : card))
            : [...projectCards, saved],
        };
      });
      setKeyboardCardId(saved.id);
      setSelectedCard(null);
      setPreviewCard(saved);
      if (hierarchyChanged) {
        await loadCards(activeProjectId);
      }
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function selectAdjacentProject(direction) {
    if (!projects.length) return;
    const currentIndex = Math.max(
      projects.findIndex((project) => project.id === activeProjectId),
      0,
    );
    const nextIndex = (currentIndex + direction + projects.length) % projects.length;
    setActiveProjectId(projects[nextIndex].id);
  }

  async function deleteSelectedCard() {
    if (!selectedCard?.id) {
      setSelectedCard(null);
      return;
    }

    try {
      await request(`/api/projmgmt/cards/${selectedCard.id}`, { method: "DELETE" });
      setCards((current) => current.filter((card) => card.id !== selectedCard.id));
      setProjectCardsById((current) => ({
        ...current,
        [selectedCard.project_id]: (current[selectedCard.project_id] || []).filter((card) => card.id !== selectedCard.id),
      }));
      setSelectedCard(null);
      setPreviewCard((current) => (current?.id === selectedCard.id ? null : current));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveCardToStatus(card, nextStatus) {
    if (!card || card.status === nextStatus) return;

    const payload = cardPayload(card, { status: nextStatus });

    try {
      const saved = await request(`/api/projmgmt/cards/${card.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      updateCardsAfterSave([saved]);
      setError("");
      setStatus(`Moved to ${statusLabels[nextStatus]}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignCardToPlanner(card, plannerDate) {
    if (!card?.title.trim() || !plannerDate) return { ok: false, message: "Choose a card and date." };
    const today = formatDateInput(new Date());
    if (plannerDate < today) {
      return { ok: false, message: "Choose today or a future date." };
    }

    try {
      const priority = plannerPriorityText(card, activeProject);
      const updatedEntry = await request(`/api/planner/card-assignments/${card.id}`, {
        method: "PUT",
        body: JSON.stringify({
          entry_date: plannerDate,
          priority_text: priority,
        }),
      });
      const assignedIndex = updatedEntry.priority_card_ids.findIndex((cardId) => cardId === card.id);
      return { ok: true, entry: updatedEntry, message: `Assigned to ${plannerDate} priority ${assignedIndex + 1}.` };
    } catch (err) {
      return { ok: false, message: err.message || "Could not assign card to planner." };
    }
  }

  async function loadPlannerEntry(entryDate) {
    return request(`/api/planner/entries/${entryDate}`);
  }

  function exportActiveProjectCards() {
    if (!activeProject) return;
    setIsCsvMenuOpen(false);

    const expandableIds = new Set(cards.filter((card) => cards.some((candidate) => candidate.parent_id === card.id)).map((card) => card.id));
    const rows = getHierarchyRows(cards, expandableIds);
    const csvRows = [
      projectCardCsvHeaders,
      ...rows.map(({ card, level }) => {
        const parent = cards.find((candidate) => candidate.id === card.parent_id);
        const dependencies = dependencyCardsFor(card, cards);
        return [
          activeProject.name,
          level,
          card.id,
          cardTypeLabels[card.card_type],
          card.title,
          statusLabels[card.status],
          card.parent_id || "",
          parent ? cardTypeLabels[parent.card_type] : "",
          parent?.title || "",
          (card.dependency_ids || []).join("; "),
          dependencies.map((dependency) => dependency.title).join("; "),
          card.start_date || "",
          card.due_date || "",
          (card.deliverables || []).join("; "),
          card.description || "",
          card.comments || "",
          card.created_at || "",
          card.updated_at || "",
        ];
      }),
    ];
    downloadCsv(`${safeFilePart(activeProject.name)}-cards-${formatDateInput(new Date())}.csv`, csvRows);
    setStatus(`Exported ${rows.length} cards`);
  }

  function downloadProjectCardTemplate() {
    setIsCsvMenuOpen(false);
    const templateRows = [projectCardCsvHeaders];
    downloadCsv(`project-card-template-${formatDateInput(new Date())}.csv`, templateRows);
    setStatus("Downloaded CSV template");
  }

  async function uploadProjectCardsCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setIsCsvMenuOpen(false);
    if (!file || !activeProjectId) return;

    try {
      const text = await file.text();
      const parsedRows = parseCsv(text);
      if (parsedRows.length < 2) throw new Error("CSV must include a header row and at least one card row.");

      const headers = csvHeaderMap(parsedRows[0]);
      for (const requiredHeader of ["Type", "Title"]) {
        if (headers[requiredHeader.toLowerCase()] === undefined) {
          throw new Error(`CSV is missing the "${requiredHeader}" column.`);
        }
      }

      const importRows = parsedRows
        .slice(1)
        .map((row, index) => {
          const cardType = normalizeCardType(csvValue(row, headers, "Type"));
          return {
            row,
            index,
            cardType,
            title: csvValue(row, headers, "Title"),
            sourceId: csvValue(row, headers, "Card ID"),
            parentId: csvValue(row, headers, "Parent ID"),
            dependencyIds: splitCsvList(csvValue(row, headers, "Dependency IDs")),
            dependencyTitles: splitCsvList(csvValue(row, headers, "Dependency Titles")),
            hierarchyLevel: Number(csvValue(row, headers, "Hierarchy Level")),
          };
        })
        .filter((row) => row.title);

      if (!importRows.length) throw new Error("CSV did not contain any cards with titles.");

      const existingById = new Map(cards.map((card) => [card.id, card]));
      const existingByTitle = new Map(cards.map((card) => [card.title.trim().toLowerCase(), card]));
      const createdBySourceId = new Map();
      const createdRecords = [];
      const sortedRows = [...importRows].sort((first, second) => {
        const firstLevel = Number.isFinite(first.hierarchyLevel) ? first.hierarchyLevel : cardTypeOrder[first.cardType] || 0;
        const secondLevel = Number.isFinite(second.hierarchyLevel) ? second.hierarchyLevel : cardTypeOrder[second.cardType] || 0;
        return firstLevel - secondLevel || first.index - second.index;
      });

      for (const importRow of sortedRows) {
        if (!importRow.cardType) throw new Error(`Unsupported card type for "${importRow.title}".`);
        const expectedParentType = parentTypeByCardType[importRow.cardType];
        const parent =
          createdBySourceId.get(importRow.parentId) ||
          existingById.get(importRow.parentId) ||
          existingByTitle.get(csvValue(importRow.row, headers, "Parent Title").toLowerCase());

        if (expectedParentType && !parent) {
          throw new Error(`${cardTypeLabels[importRow.cardType]} "${importRow.title}" needs a parent ${cardTypeLabels[expectedParentType]}.`);
        }

        const saved = await request("/api/projmgmt/cards", {
          method: "POST",
          body: JSON.stringify({
            project_id: activeProjectId,
            card_type: importRow.cardType,
            title: importRow.title,
            description: csvValue(importRow.row, headers, "Description") || null,
            comments: csvValue(importRow.row, headers, "Comments") || null,
            status: normalizeCardStatus(csvValue(importRow.row, headers, "Status")),
            start_date: csvValue(importRow.row, headers, "Start Date") || null,
            due_date: csvValue(importRow.row, headers, "Due Date") || null,
            parent_id: parent?.id || null,
            dependency_ids: [],
            deliverables: splitCsvList(csvValue(importRow.row, headers, "Deliverables")),
          }),
        });

        if (importRow.sourceId) createdBySourceId.set(importRow.sourceId, saved);
        createdRecords.push({ importRow, saved });
      }

      const allCardsById = new Map([...cards, ...createdRecords.map((record) => record.saved)].map((card) => [card.id, card]));
      const allCardsByTitle = new Map(
        [...cards, ...createdRecords.map((record) => record.saved)].map((card) => [card.title.trim().toLowerCase(), card]),
      );

      for (const { importRow, saved } of createdRecords) {
        const dependencyIds = [
          ...importRow.dependencyIds.map((dependencyId) => createdBySourceId.get(dependencyId)?.id || allCardsById.get(dependencyId)?.id),
          ...importRow.dependencyTitles.map((title) => allCardsByTitle.get(title.toLowerCase())?.id),
        ].filter(Boolean);
        const uniqueDependencyIds = [...new Set(dependencyIds)];
        if (!uniqueDependencyIds.length) continue;

        await request(`/api/projmgmt/cards/${saved.id}`, {
          method: "PUT",
          body: JSON.stringify({
            card_type: saved.card_type,
            title: saved.title,
            description: saved.description || null,
            comments: saved.comments || null,
            status: saved.status,
            start_date: saved.start_date || null,
            due_date: saved.due_date || null,
            parent_id: saved.parent_id || null,
            dependency_ids: uniqueDependencyIds,
            deliverables: saved.deliverables || [],
          }),
        });
      }

      await loadCards(activeProjectId);
      setError("");
      setStatus(`Imported ${createdRecords.length} cards`);
    } catch (err) {
      setError(err.message || "Could not import CSV.");
    }
  }

  return (
    <>
      <header className="topbar projects-topbar">
        <div>
          <div className="eyebrow">
            <FolderKanban size={16} />
            <span>Project Management</span>
          </div>
          <h1>{activeProject?.name || "Projects"}</h1>
        </div>
        <div className="project-toolbar">
          <div className="toolbar-group primary-actions" aria-label="Primary project actions">
            <span>Primary</span>
            <button className="save-button" type="button" onClick={() => startNewCard()} disabled={!activeProjectId}>
              <Plus size={18} />
              <span>Card</span>
            </button>
          </div>
          <div className="toolbar-group" aria-label="Project actions">
            <span>Project</span>
            <button className="secondary-button" type="button" onClick={() => setIsProjectSwitcherOpen((current) => !current)}>
              <FolderKanban size={18} />
              <span>Projects</span>
            </button>
            <button className="secondary-button" type="button" onClick={() => openProjectCard(activeProject)} disabled={!activeProject}>
              <FolderKanban size={18} />
              <span>Card</span>
            </button>
          </div>
          <div className="toolbar-group" aria-label="Project card CSV actions">
            <span>Cards CSV</span>
            <div className="csv-menu">
              <button className="secondary-button" type="button" onClick={() => setIsCsvMenuOpen((current) => !current)}>
                <FileText size={18} />
                <span>Data</span>
              </button>
            </div>
            <input
              ref={csvUploadInputRef}
              aria-label="Upload project cards CSV"
              className="csv-upload-input"
              type="file"
              accept=".csv,text/csv"
              onChange={uploadProjectCardsCsv}
            />
          </div>
        </div>
      </header>

      <StatusLine error={error} label={error || status} />

      <ProjectSummaryBar
        issueCount={activeProjectIssueCount}
        project={activeProject}
        summary={activeProjectSummary}
      />

      {isProjectSwitcherOpen ? (
        <section className="project-drawer" aria-label="Project selection and creation">
          <form className="project-form" onSubmit={createProject}>
            <input
              ref={projectNameInputRef}
              value={draftProject.name}
              onChange={(event) => setDraftProject((current) => ({ ...current, name: event.target.value }))}
              placeholder="New project"
            />
            <textarea
              value={draftProject.description}
              onChange={(event) =>
                setDraftProject((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Description"
            />
            <button className="save-button" type="submit">
              <Plus size={18} />
              <span>Project</span>
            </button>
          </form>

          <div className="project-list">
            {projects.map((project) => (
              <div className={project.id === activeProjectId ? "active" : ""} key={project.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveProjectId(project.id);
                    setIsProjectSwitcherOpen(false);
                  }}
                >
                  <strong>{project.name}</strong>
                  {project.description ? <span>{project.description}</span> : null}
                </button>
                <IconButton label={`Open ${project.name} project card`} onClick={() => openProjectCard(project)}>
                  <FolderKanban size={17} />
                </IconButton>
                <IconButton label={`Delete ${project.name}`} onClick={() => deleteProject(project)}>
                  <Trash2 size={17} />
                </IconButton>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <nav className="project-view-tabs" aria-label="Project management views">
        <button className={projectView === "portfolio" ? "active" : ""} type="button" onClick={() => setProjectView("portfolio")}>
          <BarChart3 size={17} />
          <span>Portfolio</span>
        </button>
        <button className={projectView === "issues" ? "active" : ""} type="button" onClick={() => setProjectView("issues")}>
          <AlertCircle size={17} />
          <span>Issues</span>
        </button>
        <button className={projectView === "graph" ? "active" : ""} type="button" onClick={() => setProjectView("graph")}>
          <GitBranch size={17} />
          <span>Graph</span>
        </button>
        <button className={projectView === "roadmap" ? "active" : ""} type="button" onClick={() => setProjectView("roadmap")}>
          <MapIcon size={17} />
          <span>Roadmap</span>
        </button>
        <button className={projectView === "timeline" ? "active" : ""} type="button" onClick={() => setProjectView("timeline")}>
          <CalendarDays size={17} />
          <span>Timeline</span>
        </button>
        <button className={projectView === "gantt" ? "active" : ""} type="button" onClick={() => setProjectView("gantt")}>
          <BarChart3 size={17} />
          <span>Gantt</span>
        </button>
        <button className={projectView === "calendar" ? "active" : ""} type="button" onClick={() => setProjectView("calendar")}>
          <CalendarDays size={17} />
          <span>Calendar</span>
        </button>
        <button className={projectView === "board" ? "active" : ""} type="button" onClick={() => setProjectView("board")}>
          <FolderKanban size={17} />
          <span>Board</span>
        </button>
      </nav>

      <div className="project-controls-strip">
        <ProjectFilters
          filters={projectFilters}
          hasActiveFilters={hasActiveFilters}
          isOpen={isFilterPanelOpen}
          onClear={clearProjectFilters}
          onQueryChange={(value) => updateProjectFilter("query", value)}
          onScheduleChange={(value) => updateProjectFilter("schedule", value)}
          onToggleOpen={() => setIsFilterPanelOpen((current) => !current)}
          onToggleCardType={(value) => toggleProjectFilter("cardTypes", value)}
          onToggleStatus={(value) => toggleProjectFilter("statuses", value)}
          resultCount={filteredCards.length}
          searchInputRef={searchInputRef}
          totalCount={cards.length}
        />

        <BulkEditPanel
          bulkDraft={bulkDraft}
          cards={cards}
          filteredCards={filteredCards}
          isOpen={isBulkEditOpen}
          onApply={applyBulkEdits}
          onClearSelection={() => setSelectedBulkCardIds([])}
          onSelectAll={selectAllFilteredCards}
          onToggleOpen={() => setIsBulkEditOpen((current) => !current)}
          onUpdateDraft={(field, value) => setBulkDraft((current) => ({ ...current, [field]: value }))}
          selectedCards={selectedBulkCards}
        />
      </div>

      <div className="projects-layout">
        {projectView === "portfolio" ? (
          <PortfolioOverview
            cardsByProjectId={hasActiveFilters ? filteredProjectCardsById : projectCardsById}
            onOpenProject={openProjectCard}
            onStartProject={() => setIsProjectSwitcherOpen(true)}
            projects={projects}
            selectedProjectId={activeProjectId}
            setActiveProjectId={setActiveProjectId}
          />
        ) : null}

        {projectView === "roadmap" ? (
          <ProjectRoadmap
            cards={filteredCards}
            onCreateEpic={() => startNewCard("epic", "backlog")}
            onOpenCard={setPreviewCard}
            project={activeProject}
          />
        ) : null}

        {projectView === "issues" ? (
          <ProjectIssues
            cards={filteredCards}
            onMoveCard={moveCardToStatus}
            onOpenCard={setPreviewCard}
            onStartNewCard={startNewCard}
            project={activeProject}
          />
        ) : null}

        {projectView === "graph" ? (
          <DependencyGraph cards={filteredCards} onOpenCard={setPreviewCard} onStartNewCard={startNewCard} project={activeProject} />
        ) : null}

        {projectView === "board" ? (
          <ProjectBoard
            cards={filteredCards}
            onMoveCard={moveCardToStatus}
            onOpenCard={setPreviewCard}
            onStartNewCard={startNewCard}
            onToggleBulkCard={toggleBulkCard}
            selectedCardId={previewCard?.id || keyboardCardId}
            selectedBulkCardIds={selectedBulkCardIds}
          />
        ) : null}

        {projectView === "timeline" ? (
          <ProjectTimeline cards={filteredCards} onOpenCard={setPreviewCard} onStartNewCard={startNewCard} project={activeProject} />
        ) : null}

        {projectView === "gantt" ? (
          <ProjectGantt cards={filteredCards} onOpenCard={setPreviewCard} onStartNewCard={startNewCard} project={activeProject} />
        ) : null}

        {projectView === "calendar" ? (
          <ProjectCalendar cards={filteredCards} onOpenCard={setPreviewCard} onStartNewCard={startNewCard} project={activeProject} />
        ) : null}
      </div>

      {previewCard ? (
        <CardPreviewPanel
          card={previewCard}
          cards={cards}
          onClose={() => setPreviewCard(null)}
          onEdit={(card) => setSelectedCard(card)}
          onMoveCard={moveCardToStatus}
          onOpenCard={setPreviewCard}
          onSaveDates={projectView === "gantt" ? savePreviewDates : null}
        />
      ) : null}

      {isCsvMenuOpen ? (
        <CsvActionsPanel
          activeProject={activeProject}
          onClose={() => setIsCsvMenuOpen(false)}
          onDownloadTemplate={downloadProjectCardTemplate}
          onExport={exportActiveProjectCards}
          onImport={() => csvUploadInputRef.current?.click()}
        />
      ) : null}

      {selectedCard ? (
        <CardEditor
          activity={selectedCardActivity}
          card={selectedCard}
          cards={cards}
          onCancel={() => setSelectedCard(null)}
          onChange={setSelectedCard}
          onAssignToPlanner={assignCardToPlanner}
          onCreateChild={(parent, title) => createInlineCard({ parent, title })}
          onDelete={deleteSelectedCard}
          onLoadPlannerEntry={loadPlannerEntry}
          onSubmit={saveCard}
        />
      ) : null}

      {selectedProject ? (
        <ProjectEditor
          cards={cards}
          onCancel={() => setSelectedProject(null)}
          onChange={setSelectedProject}
          onCreateEpic={(project, title) => createInlineCard({ project, title })}
          onDelete={deleteProject}
          onOpenCard={(card) => {
            setSelectedProject(null);
            setSelectedCard(card);
          }}
          onSubmit={saveSelectedProject}
          project={selectedProject}
        />
      ) : null}
    </>
  );
}

const plannerEndpoints = [
  {
    method: "GET",
    path: "/api/planner/entries/{entry_date}",
    purpose: "Load one planner entry. Returns an empty entry when none exists.",
  },
  {
    method: "PUT",
    path: "/api/planner/entries/{entry_date}",
    purpose: "Create or replace one planner entry. URL date must match body entry_date.",
  },
  {
    method: "PUT",
    path: "/api/planner/card-assignments/{card_id}",
    purpose: "Assign or move a linked card into a planner priority slot.",
  },
  {
    method: "DELETE",
    path: "/api/planner/card-assignments/{card_id}",
    purpose: "Remove a linked card from its planner priority slot.",
  },
  {
    method: "GET",
    path: "/api/entries/{entry_date}",
    purpose: "Legacy alias for loading planner entries.",
  },
  {
    method: "PUT",
    path: "/api/entries/{entry_date}",
    purpose: "Legacy alias for saving planner entries.",
  },
];

const projectEndpoints = [
  {
    method: "GET",
    path: "/api/projmgmt/projects",
    purpose: "List projects ordered by update time.",
  },
  {
    method: "POST",
    path: "/api/projmgmt/projects",
    purpose: "Create a project.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/projects/{project_id}",
    purpose: "Load one project.",
  },
  {
    method: "PUT",
    path: "/api/projmgmt/projects/{project_id}",
    purpose: "Update a project name and description.",
  },
  {
    method: "DELETE",
    path: "/api/projmgmt/projects/{project_id}",
    purpose: "Delete a project and its cards.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/projects/{project_id}/cards",
    purpose: "List cards for one project.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/projects/{project_id}/issues",
    purpose: "List server-side dependency and hierarchy schedule warnings for one project.",
  },
  {
    method: "POST",
    path: "/api/projmgmt/cards",
    purpose: "Create an epic, feature, story, or subtask card.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/cards/{card_id}",
    purpose: "Load one card.",
  },
  {
    method: "GET",
    path: "/api/projmgmt/cards/{card_id}/activity",
    purpose: "List tracked type, status, date, parent, and comment changes for one card.",
  },
  {
    method: "PUT",
    path: "/api/projmgmt/cards/{card_id}",
    purpose: "Update a card; type changes shift descendant levels when hierarchy depth remains valid.",
  },
  {
    method: "DELETE",
    path: "/api/projmgmt/cards/{card_id}",
    purpose: "Delete a card that has no child cards.",
  },
];

function ApiReference() {
  return (
    <>
      <header className="topbar api-topbar">
        <div>
          <div className="eyebrow">
            <ClipboardList size={16} />
            <span>API Reference</span>
          </div>
          <h1>Local API</h1>
        </div>
        <a className="secondary-button api-doc-link" href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">
          Open Docs
        </a>
      </header>

      <div className="api-reference-grid">
        <section className="api-panel api-overview">
          <h2>Development URLs</h2>
          <dl>
            <div>
              <dt>API server</dt>
              <dd>http://127.0.0.1:8000</dd>
            </div>
            <div>
              <dt>OpenAPI JSON</dt>
              <dd>/openapi.json</dd>
            </div>
            <div>
              <dt>Interactive docs</dt>
              <dd>/docs</dd>
            </div>
          </dl>
        </section>

        <ApiEndpointSection title="Planner" endpoints={plannerEndpoints} />
        <ApiEndpointSection title="Project Manager" endpoints={projectEndpoints} />

        <section className="api-panel">
          <h2>Planner Entry</h2>
          <CodeBlock
            value={`{
  "entry_date": "2026-05-17",
  "priorities": ["Ship project views"],
  "priority_card_ids": ["linked-card-id"],
  "tasks": [
    { "text": "Review API reference", "completed": false }
  ],
  "schedule": "09:00 Focus block",
  "notes": "Anything useful from the day."
}`}
          />
        </section>

        <section className="api-panel">
          <h2>Project Card</h2>
          <CodeBlock
            value={`{
  "project_id": "project-id",
  "card_type": "feature",
  "title": "Timeline view",
  "description": "Show scheduled work",
  "comments": "## Notes\\n\\n\`\`\`mermaid\\ngraph TD\\nA-->B\\n\`\`\`",
  "status": "in_progress",
  "start_date": "2026-05-17",
  "due_date": "2026-05-24",
  "parent_id": "epic-id",
  "dependency_ids": ["api-contract-card-id"],
  "deliverables": ["Timeline", "Gantt"]
}`}
          />
        </section>

        <section className="api-panel">
          <h2>Project Card Activity</h2>
          <CodeBlock
            value={`{
  "id": "activity-id",
  "project_id": "project-id",
  "card_id": "card-id",
  "field_name": "status",
  "old_value": "backlog",
  "new_value": "in_progress",
  "created_at": "2026-05-18T14:30:00Z"
}`}
          />
        </section>

        <section className="api-panel">
          <h2>Card Rules</h2>
          <ul className="api-rule-list">
            <li>Valid card types: epic, feature, story, subtask.</li>
            <li>Valid statuses: backlog, in_progress, blocked, done.</li>
            <li>Features must have an epic parent.</li>
            <li>Stories must have a feature parent.</li>
            <li>Subtasks must have a story parent.</li>
            <li>Start date must be on or before due date.</li>
            <li>Dependency cards must belong to the same project.</li>
            <li>Dependency date conflicts are warnings and do not block saves.</li>
            <li>Changing a card type shifts every descendant by the same number of levels.</li>
            <li>Type changes are rejected when a descendant would move below subtask.</li>
            <li>Cards with children cannot be deleted.</li>
          </ul>
        </section>
      </div>
    </>
  );
}

function ApiEndpointSection({ endpoints, title }) {
  return (
    <section className="api-panel api-endpoints">
      <h2>{title}</h2>
      <div>
        {endpoints.map((endpoint) => (
          <article className="api-endpoint" key={`${endpoint.method}-${endpoint.path}`}>
            <span className={`api-method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
            <code>{endpoint.path}</code>
            <p>{endpoint.purpose}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CodeBlock({ value }) {
  return <pre className="api-code"><code>{value}</code></pre>;
}

function ProjectSummaryBar({ issueCount, project, summary }) {
  if (!project) {
    return (
      <section className="project-summary-bar">
        <div>
          <span>Active Project</span>
          <strong>No project selected</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="project-summary-bar">
      <div className="project-summary-description">
        <span>Active Project</span>
        <strong>{project.description || "No description"}</strong>
      </div>
      <div>
        <span>Total Cards</span>
        <strong>{summary.total}</strong>
      </div>
      <div className={issueCount ? "attention" : ""}>
        <span>Open Issues</span>
        <strong>{issueCount}</strong>
      </div>
      <div>
        <span>Next Due</span>
        <strong>{summary.nextDueDate || "None"}</strong>
      </div>
      <div>
        <span>Complete</span>
        <strong>{summary.completion}%</strong>
      </div>
    </section>
  );
}

function ProjectFilters({
  filters,
  hasActiveFilters,
  isOpen,
  onClear,
  onQueryChange,
  onScheduleChange,
  onToggleOpen,
  onToggleCardType,
  onToggleStatus,
  resultCount,
  searchInputRef,
  totalCount,
}) {
  return (
    <section className="project-filter-shell" aria-label="Project filters">
      <button
        className="project-filter-toggle"
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
      >
        <span>Filters</span>
        <strong>{resultCount} of {totalCount} cards</strong>
        <span>{isOpen ? "Hide" : "Show"}</span>
      </button>

      {isOpen ? (
        <div className="project-filter-panel">
          <label className="filter-search">
            <span>Search</span>
            <input
              ref={searchInputRef}
              value={filters.query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Title, description, comments, deliverables"
            />
          </label>

          <div className="filter-group" aria-label="Card type filters">
            <span>Type</span>
            <div className="filter-buttons">
              {CARD_TYPES.map((type) => (
                <button
                  className={filters.cardTypes.includes(type) ? "filter-chip active" : "filter-chip"}
                  key={type}
                  type="button"
                  onClick={() => onToggleCardType(type)}
                >
                  {cardTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group" aria-label="Status filters">
            <span>Status</span>
            <div className="filter-buttons">
              {STATUSES.map((statusValue) => (
                <button
                  className={filters.statuses.includes(statusValue) ? "filter-chip active" : "filter-chip"}
                  key={statusValue}
                  type="button"
                  onClick={() => onToggleStatus(statusValue)}
                >
                  {statusLabels[statusValue]}
                </button>
              ))}
            </div>
          </div>

          <label className="filter-schedule">
            <span>Schedule</span>
            <select value={filters.schedule} onChange={(event) => onScheduleChange(event.target.value)}>
              <option value="all">All cards</option>
              <option value="blocked">Blocked</option>
              <option value="overdue">Overdue</option>
              <option value="due_soon">Due soon</option>
              <option value="undated">Unassigned dates</option>
            </select>
          </label>

          <div className="filter-summary">
            {hasActiveFilters ? (
              <button className="secondary-button" type="button" onClick={onClear}>
                Clear
              </button>
            ) : null}
          </div>

          <div className="project-filter-footer">
            <p className="project-shortcuts">
              / search | J/K select | Enter open | Alt+1-7 views | Alt+0 clear
            </p>
            <span>
              {resultCount} of {totalCount} cards
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BulkEditPanel({
  bulkDraft,
  cards,
  filteredCards,
  isOpen,
  onApply,
  onClearSelection,
  onSelectAll,
  onToggleOpen,
  onUpdateDraft,
  selectedCards,
}) {
  const hasDraft = Boolean(bulkDraft.status || bulkDraft.start_date || bulkDraft.due_date || bulkDraft.card_type);
  const targetCount = selectedCards.length || filteredCards.length;
  const typeEligibleCount = bulkDraft.card_type
    ? (selectedCards.length ? selectedCards : filteredCards).filter((card) => cardCanChangeType(card, bulkDraft.card_type, cards)).length
    : targetCount;

  return (
    <section className="bulk-edit-shell" aria-label="Bulk edit cards">
      <button
        className="bulk-edit-toggle"
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
      >
        <span>Bulk Edit</span>
        <strong>{selectedCards.length ? `${selectedCards.length} selected` : `${filteredCards.length} filtered`}</strong>
        <span>{isOpen ? "Hide" : "Show"}</span>
      </button>

      {isOpen ? (
        <div className="bulk-edit-panel">
          <header>
            <div>
              <span>Targets</span>
              <strong>{selectedCards.length ? "Selected cards" : "Filtered cards"}</strong>
            </div>
            <div>
              <button className="secondary-button" type="button" onClick={onSelectAll} disabled={!filteredCards.length}>
                Select Filtered
              </button>
              <button className="secondary-button" type="button" onClick={onClearSelection} disabled={!selectedCards.length}>
                Clear
              </button>
            </div>
          </header>

          <div className="bulk-edit-controls">
            <label>
              <span>Status</span>
              <select value={bulkDraft.status} onChange={(event) => onUpdateDraft("status", event.target.value)}>
                <option value="">No change</option>
                {STATUSES.map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {statusLabels[statusValue]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Start Date</span>
              <input type="date" value={bulkDraft.start_date} onChange={(event) => onUpdateDraft("start_date", event.target.value)} />
            </label>
            <label>
              <span>Due Date</span>
              <input type="date" value={bulkDraft.due_date} onChange={(event) => onUpdateDraft("due_date", event.target.value)} />
            </label>
            <label>
              <span>Type</span>
              <select value={bulkDraft.card_type} onChange={(event) => onUpdateDraft("card_type", event.target.value)}>
                <option value="">No change</option>
                {CARD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {cardTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <button className="save-button" type="button" onClick={onApply} disabled={!targetCount || !hasDraft}>
              Apply
            </button>
          </div>

          {bulkDraft.card_type && typeEligibleCount !== targetCount ? (
            <p>{targetCount - typeEligibleCount} card{targetCount - typeEligibleCount === 1 ? "" : "s"} will be skipped because the current hierarchy does not allow that type.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProjectBoard({ cards, onMoveCard, onOpenCard, onStartNewCard, onToggleBulkCard, selectedBulkCardIds, selectedCardId }) {
  const [dragOverStatus, setDragOverStatus] = useState("");

  function dropCard(event, statusValue) {
    event.preventDefault();
    const cardId = event.dataTransfer.getData("text/plain");
    const card = cards.find((candidate) => candidate.id === cardId);
    setDragOverStatus("");
    onMoveCard(card, statusValue);
  }

  return (
    <section className="project-board">
      {STATUSES.map((statusValue) => (
        <div
          className={dragOverStatus === statusValue ? "board-column drag-over" : "board-column"}
          key={statusValue}
          onDragLeave={() => setDragOverStatus((current) => (current === statusValue ? "" : current))}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverStatus(statusValue);
          }}
          onDrop={(event) => dropCard(event, statusValue)}
        >
          <header>
            <h2>{statusLabels[statusValue]}</h2>
            <IconButton label={`Add ${statusLabels[statusValue]} card`} onClick={() => onStartNewCard("epic", statusValue)}>
              <Plus size={18} />
            </IconButton>
          </header>
          <div className="card-stack">
            {cards
              .filter((card) => card.status === statusValue)
              .map((card) => (
                <ProjectCardButton
                  card={card}
                  cards={cards}
                  isSelected={card.id === selectedCardId}
                  key={card.id}
                  onOpenCard={onOpenCard}
                  onToggleBulkCard={onToggleBulkCard}
                  selectedForBulk={selectedBulkCardIds.includes(card.id)}
                />
              ))}
            {cards.filter((card) => card.status === statusValue).length ? null : (
              <p className="empty-column">No matching cards</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function ProjectCardButton({ card, cards, isSelected, onOpenCard, onToggleBulkCard, selectedForBulk }) {
  return (
    <button
      className={isSelected ? "project-card keyboard-selected" : "project-card"}
      draggable
      type="button"
      onClick={() => onOpenCard(card)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.id);
      }}
    >
      <span className="bulk-select-control" onClick={(event) => event.stopPropagation()}>
        <input
          aria-label={`Select ${card.title} for bulk edit`}
          checked={selectedForBulk}
          type="checkbox"
          onChange={() => onToggleBulkCard(card.id)}
        />
      </span>
      <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
      <strong>{card.title}</strong>
      {card.description ? <p>{card.description}</p> : null}
      <span className="relationship-label">{cardRelationshipLabel(card, cards)}</span>
      <IssueMarker card={card} cards={cards} />
      <footer>
        {card.start_date ? <span>Start {card.start_date}</span> : null}
        {card.due_date ? <span>Due {card.due_date}</span> : <span>No due date</span>}
        <span>{card.deliverables.length} deliverables</span>
      </footer>
    </button>
  );
}

function IssueMarker({ card, cards, compact = false }) {
  const issues = allCardIssues(card, cards);
  if (!issues.length) return null;
  return (
    <span className={compact ? "issue-badge compact" : "issue-badge"}>
      {issues.length} issue{issues.length === 1 ? "" : "s"}
    </span>
  );
}

function groupIssuesByType(issueGroups, issueType) {
  return issueGroups
    .map(({ card, issues }) => ({
      card,
      issues: issues.filter((issue) => issue.type === issueType),
    }))
    .filter((group) => group.issues.length);
}

function ProjectIssues({ cards, onMoveCard, onOpenCard, onStartNewCard, project }) {
  const issueGroups = projectIssuesForCards(cards);
  const blockedGroups = groupIssuesByType(issueGroups, "blocked_dependency");
  const dateConflictGroups = groupIssuesByType(issueGroups, "date_conflict");
  const hierarchyConflictGroups = groupIssuesByType(issueGroups, "hierarchy_date_conflict");
  const blockedCount = issueGroups.reduce(
    (total, group) => total + group.issues.filter((issue) => issue.type === "blocked_dependency").length,
    0,
  );
  const dateConflictCount = issueGroups.reduce(
    (total, group) => total + group.issues.filter((issue) => issue.type === "date_conflict").length,
    0,
  );
  const hierarchyConflictCount = issueGroups.reduce(
    (total, group) => total + group.issues.filter((issue) => issue.type === "hierarchy_date_conflict").length,
    0,
  );

  if (!project) {
    return <EmptyProjectView label="Create or select a project to see dependency issues." />;
  }

  return (
    <section className="overview-workspace">
      <div className="overview-summary-grid">
        <MetricTile label="Cards With Issues" tone={issueGroups.length ? "danger" : ""} value={issueGroups.length} />
        <MetricTile label="Blocked Dependencies" tone={blockedCount ? "danger" : ""} value={blockedCount} />
        <MetricTile label="Date Conflicts" tone={dateConflictCount ? "danger" : ""} value={dateConflictCount} />
        <MetricTile label="Hierarchy Conflicts" tone={hierarchyConflictCount ? "danger" : ""} value={hierarchyConflictCount} />
      </div>

      <section className="overview-panel issues-panel">
        <header>
          <h2>Issues</h2>
          <span>{project.name}</span>
        </header>
        {issueGroups.length ? (
          <div className="issues-list">
            <IssueGroup
              actionLabel="Mark blocked"
              groups={blockedGroups}
              onAction={(card) => onMoveCard(card, "blocked")}
              onOpenCard={onOpenCard}
              title="Blocked Dependencies"
            />
            <IssueGroup
              actionLabel="Open card"
              groups={dateConflictGroups}
              onAction={onOpenCard}
              onOpenCard={onOpenCard}
              title="Date Conflicts"
            />
            <IssueGroup
              actionLabel="Open card"
              groups={hierarchyConflictGroups}
              onAction={onOpenCard}
              onOpenCard={onOpenCard}
              title="Hierarchy Date Conflicts"
            />
          </div>
        ) : (
          <EmptyState
            actionLabel="Add Card"
            label="No blocked dependencies or date conflicts."
            onAction={() => onStartNewCard("epic", "backlog")}
          />
        )}
      </section>
    </section>
  );
}

function IssueGroup({ actionLabel, groups, onAction, onOpenCard, title }) {
  if (!groups.length) return null;
  return (
    <section className="issue-group">
      <h3>{title}</h3>
      {groups.map(({ card, issues }) => (
        <article className="issue-row" key={`${title}-${card.id}`}>
          <button type="button" onClick={() => onOpenCard(card)}>
            <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
            <strong>{card.title}</strong>
          </button>
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.type}-${issue.dependency.id}-${issue.boundary || ""}`}>
                <button type="button" onClick={() => onOpenCard(issue.dependency)}>
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
          <div className="issue-actions">
            <button className="secondary-button" type="button" onClick={() => onOpenCard(card)}>
              Open
            </button>
            <button className="secondary-button" type="button" onClick={() => onAction(card)}>
              {actionLabel}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function DependencyGraph({ cards, onOpenCard, onStartNewCard, project }) {
  const edges = dependencyEdgesForCards(cards);
  const blockedEdges = edges.filter((edge) => edge.dependency.status === "blocked");
  const conflictEdges = edges.filter((edge) => edge.issues.some((issue) => issue.type === "date_conflict"));
  const chainCards = cards.filter((card) => card.dependency_ids?.length || dependencyDependentsFor(card.id, cards).length);

  if (!project) {
    return <EmptyProjectView label="Create or select a project to see its dependency graph." />;
  }

  return (
    <section className="overview-workspace">
      <div className="overview-summary-grid graph-summary-grid">
        <MetricTile label="Dependency Edges" value={edges.length} />
        <MetricTile label="Cards In Graph" value={chainCards.length} />
        <MetricTile label="Blocked Chains" tone={blockedEdges.length ? "danger" : ""} value={blockedEdges.length} />
        <MetricTile label="Date Conflicts" tone={conflictEdges.length ? "danger" : ""} value={conflictEdges.length} />
      </div>

      <section className="overview-panel dependency-graph-panel">
        <header>
          <h2>{project.name} Dependency Graph</h2>
          <span>Blocked-by relationships</span>
        </header>
        {edges.length ? (
          <div className="dependency-edge-list">
            {edges.map(({ dependency, dependent, issues }) => (
              <article
                className={issues.length || dependency.status === "blocked" ? "dependency-edge has-issue" : "dependency-edge"}
                key={`${dependency.id}-${dependent.id}`}
              >
                <button type="button" onClick={() => onOpenCard(dependency)}>
                  <span className={`card-type ${dependency.card_type}`}>{cardTypeLabels[dependency.card_type]}</span>
                  <strong>{dependency.title}</strong>
                  <em>{statusLabels[dependency.status]}</em>
                </button>
                <span className="dependency-arrow">blocks</span>
                <button type="button" onClick={() => onOpenCard(dependent)}>
                  <span className={`card-type ${dependent.card_type}`}>{cardTypeLabels[dependent.card_type]}</span>
                  <strong>{dependent.title}</strong>
                  <em>{statusLabels[dependent.status]}</em>
                </button>
                <div>
                  {dependency.status === "blocked" ? <span className="issue-badge compact">blocked chain</span> : null}
                  {issues.map((issue) => (
                    <span className="issue-badge compact" key={`${issue.type}-${issue.dependency.id}-${issue.boundary || ""}`}>{issue.type === "date_conflict" ? "date conflict" : "issue"}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            actionLabel="Add Card"
            label="No dependency links yet. Add dependencies from a card to populate the graph."
            onAction={() => onStartNewCard("epic", "backlog")}
          />
        )}
      </section>
    </section>
  );
}

function PortfolioOverview({ cardsByProjectId, onOpenProject, onStartProject, projects, selectedProjectId, setActiveProjectId }) {
  const allCards = projects.flatMap((project) => cardsByProjectId[project.id] || []);
  const portfolioSummary = summarizeCards(allCards);
  const atRiskCards = sortCardsForRoadmap(
    allCards.filter((card) => card.status === "blocked" || isOverdue(card)),
  ).slice(0, 8);

  return (
    <section className="overview-workspace">
      <div className="overview-summary-grid">
        <MetricTile label="Projects" value={projects.length} />
        <MetricTile label="Open Cards" value={portfolioSummary.total - portfolioSummary.done} />
        <MetricTile label="Blocked" tone={portfolioSummary.blocked ? "danger" : ""} value={portfolioSummary.blocked} />
        <MetricTile label="Overdue" tone={portfolioSummary.overdue ? "danger" : ""} value={portfolioSummary.overdue} />
        <MetricTile label="Due Soon" value={portfolioSummary.dueSoon} />
        <MetricTile label="Done" value={`${portfolioSummary.completion}%`} />
      </div>

      <div className="portfolio-grid">
        <section className="overview-panel">
          <header>
            <h2>Projects</h2>
            <span>{allCards.length} total cards</span>
          </header>
          <div className="portfolio-project-list">
            {projects.length ? projects.map((project) => {
              const projectCards = cardsByProjectId[project.id] || [];
              const summary = summarizeCards(projectCards);
              return (
                <button
                  className={project.id === selectedProjectId ? "portfolio-project active" : "portfolio-project"}
                  key={project.id}
                  type="button"
                  onClick={() => setActiveProjectId(project.id)}
                  onDoubleClick={() => onOpenProject(project)}
                >
                  <div>
                    <strong>{project.name}</strong>
                    {project.description ? <span>{project.description}</span> : null}
                  </div>
                  <ProgressBar value={summary.completion} />
                  <ProjectSummaryChips summary={summary} />
                </button>
              );
            }) : (
              <EmptyState actionLabel="Create Project" label="No projects yet." onAction={onStartProject} />
            )}
          </div>
        </section>

        <section className="overview-panel">
          <header>
            <h2>At Risk</h2>
            <span>Blocked or overdue</span>
          </header>
          <div className="risk-list">
            {atRiskCards.length ? (
              atRiskCards.map((card) => {
                const project = projects.find((candidate) => candidate.id === card.project_id);
                return (
                  <div className="risk-row" key={card.id}>
                    <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
                    <div>
                      <strong>{card.title}</strong>
                      <span>{project?.name || "Unknown project"}</span>
                    </div>
                    <span className={isOverdue(card) ? "risk-badge overdue" : "risk-badge"}>
                      {isOverdue(card) ? "Overdue" : statusLabels[card.status]}
                    </span>
                  </div>
                );
              })
            ) : (
              <EmptyState label="No blocked or overdue work." />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function ProjectRoadmap({ cards, onCreateEpic, onOpenCard, project }) {
  const epics = sortCardsForRoadmap(cards.filter((card) => card.card_type === "epic"));

  if (!project) {
    return (
      <section className="overview-workspace">
        <div className="overview-panel empty-overview">Create or select a project to see its roadmap.</div>
      </section>
    );
  }

  return (
    <section className="overview-workspace">
      <div className="roadmap-header">
        <div>
          <h2>{project.name} Roadmap</h2>
          <p>{project.description || "Epics, features, stories, and subtasks grouped by parent card."}</p>
        </div>
        <button className="save-button" type="button" onClick={onCreateEpic}>
          <Plus size={18} />
          <span>Epic</span>
        </button>
      </div>

      {epics.length ? (
        <div className="roadmap-list">
          {epics.map((epic) => (
            <RoadmapEpic cards={cards} epic={epic} key={epic.id} onOpenCard={onOpenCard} />
          ))}
        </div>
      ) : (
        <EmptyState actionLabel="Add Epic" label="No epics yet. Add an epic to start the roadmap." onAction={onCreateEpic} />
      )}
    </section>
  );
}

function RoadmapEpic({ cards, epic, onOpenCard }) {
  const features = sortCardsForRoadmap(cards.filter((card) => card.parent_id === epic.id));
  const childCards = collectDescendants(epic.id, cards);
  const summary = summarizeCards([epic, ...childCards]);

  return (
    <article className="roadmap-epic">
      <button className="roadmap-card epic-row" type="button" onClick={() => onOpenCard(epic)}>
        <div>
          <span className={`card-type ${epic.card_type}`}>{cardTypeLabels[epic.card_type]}</span>
          <strong>{epic.title}</strong>
          <IssueMarker card={epic} cards={cards} />
          {epic.description ? <p>{epic.description}</p> : null}
        </div>
        <ProjectSummaryChips summary={summary} />
      </button>

      <div className="roadmap-feature-list">
        {features.map((feature) => (
          <RoadmapFeature cards={cards} feature={feature} key={feature.id} onOpenCard={onOpenCard} />
        ))}
      </div>
    </article>
  );
}

function RoadmapFeature({ cards, feature, onOpenCard }) {
  const stories = sortCardsForRoadmap(cards.filter((card) => card.parent_id === feature.id));
  const childCards = collectDescendants(feature.id, cards);
  const summary = summarizeCards([feature, ...childCards]);

  return (
    <article className="roadmap-feature">
      <button className="roadmap-card" type="button" onClick={() => onOpenCard(feature)}>
        <div>
          <span className={`card-type ${feature.card_type}`}>{cardTypeLabels[feature.card_type]}</span>
          <strong>{feature.title}</strong>
          <IssueMarker card={feature} cards={cards} />
        </div>
        <ProjectSummaryChips summary={summary} />
      </button>

      {stories.length ? (
        <div className="roadmap-story-grid">
          {stories.map((story) => {
            const subtasks = cards.filter((card) => card.parent_id === story.id);
            return (
              <button className="roadmap-story" key={story.id} type="button" onClick={() => onOpenCard(story)}>
                <span className={`card-type ${story.card_type}`}>{cardTypeLabels[story.card_type]}</span>
                <strong>{story.title}</strong>
                <IssueMarker card={story} cards={cards} />
                <footer>
                  <span>{statusLabels[story.status]}</span>
                  {story.start_date ? <span>Start {story.start_date}</span> : null}
                  {story.due_date ? <span>Due {story.due_date}</span> : null}
                  <span>{subtasks.length} subtasks</span>
                </footer>
              </button>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

function ProjectTimeline({ cards, onOpenCard, onStartNewCard, project }) {
  const points = getTimelinePoints(cards);

  if (!project) {
    return <EmptyProjectView label="Create or select a project to see its timeline." />;
  }

  return (
    <section className="overview-workspace">
      <div className="roadmap-header">
        <div>
          <h2>{project.name} Timeline</h2>
          <p>Start and due milestones for scheduled cards.</p>
        </div>
      </div>

      {points.length ? (
        <div className="timeline-list">
          {points.map((point) => (
            <button className="timeline-row" key={`${point.card.id}-${point.kind}-${point.date}`} type="button" onClick={() => onOpenCard(point.card)}>
              <time>{point.date}</time>
              <span className={point.kind === "Due" ? "timeline-kind due" : "timeline-kind"}>{point.kind}</span>
              <span className={`card-type ${point.card.card_type}`}>{cardTypeLabels[point.card.card_type]}</span>
              <strong>{point.card.title}</strong>
              <IssueMarker card={point.card} cards={cards} compact />
              <span>{statusLabels[point.card.status]}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          actionLabel="Add Card"
          label="No scheduled cards. Add start dates or due dates to populate the timeline."
          onAction={() => onStartNewCard("epic", "backlog")}
        />
      )}
    </section>
  );
}

function ProjectGantt({ cards, onOpenCard, onStartNewCard, project }) {
  const [expandedCardIds, setExpandedCardIds] = useState(() => new Set());
  const [showUndatedCards, setShowUndatedCards] = useState(true);
  const rows = getHierarchyRows(cards, expandedCardIds);
  const ganttSchedules = new Map(cards.map((card) => [card.id, ganttScheduleForCard(card, cards)]));
  const visibleRows = showUndatedCards ? rows : rows.filter(({ card }) => ganttSchedules.get(card.id).start);
  const scheduled = cards
    .map((card) => {
      const schedule = ganttSchedules.get(card.id);
      return schedule.start || schedule.end
        ? { ...card, start_date: schedule.start, due_date: schedule.end }
        : null;
    })
    .filter(Boolean);
  const bounds = getScheduleBounds(scheduled);
  const totalDays = Math.max(daysBetween(bounds.start, bounds.end), 1);
  const ganttRightPadding = 3;
  const undatedCount = rows.filter(({ card }) => !ganttSchedules.get(card.id).start).length;
  const expandableCardIds = cards
    .filter((card) => cards.some((candidate) => candidate.parent_id === card.id))
    .map((card) => card.id);

  function toggleExpanded(cardId) {
    setExpandedCardIds((current) => {
      const next = new Set(current);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedCardIds(new Set(expandableCardIds));
  }

  function collapseAll() {
    setExpandedCardIds(new Set());
  }

  if (!project) {
    return <EmptyProjectView label="Create or select a project to see its Gantt chart." />;
  }

  return (
    <section className="overview-workspace">
      <div className="roadmap-header">
        <div>
          <h2>{project.name} Gantt</h2>
          <p>
            {bounds.start} to {bounds.end}
          </p>
        </div>
        <div className="gantt-controls">
          <label className="gantt-toggle-option">
            <input
              checked={showUndatedCards}
              type="checkbox"
              onChange={(event) => setShowUndatedCards(event.target.checked)}
            />
            <span>Show undated</span>
            {undatedCount ? <em>{undatedCount}</em> : null}
          </label>
          <button className="secondary-button" type="button" onClick={expandAll} disabled={!expandableCardIds.length}>
            Expand All
          </button>
          <button className="secondary-button" type="button" onClick={collapseAll} disabled={!expandedCardIds.size}>
            Collapse All
          </button>
        </div>
      </div>

      {visibleRows.length ? (
        <div className="gantt-chart">
          {visibleRows.map(({ card, childrenCount, isExpanded, level }) => {
            const schedule = ganttSchedules.get(card.id);
            const { start, end, isDerived } = schedule;
            const hasSchedule = Boolean(start && end);
            const offset = hasSchedule ? Math.max(daysBetween(bounds.start, start), 0) : 0;
            const duration = hasSchedule ? Math.max(daysBetween(start, end), 0) : 0;
            const left = hasSchedule ? (offset / totalDays) * 100 : 0;
            const width = hasSchedule ? Math.max(((duration || 1) / totalDays) * 100, 3) : 0;
            const clampedWidth = Math.max(Math.min(width, 100 - left - ganttRightPadding), 3);
            return (
              <article className={`gantt-row level-${level}`} key={card.id} style={{ "--gantt-indent": `${level * 22}px` }}>
                <div className="gantt-card-label">
                  <button
                    className="gantt-toggle"
                    type="button"
                    onClick={() => toggleExpanded(card.id)}
                    disabled={!childrenCount}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${card.title}`}
                    title={`${isExpanded ? "Collapse" : "Expand"} ${card.title}`}
                  >
                    {childrenCount ? (isExpanded ? "-" : "+") : ""}
                  </button>
                  <button className="gantt-card-open" type="button" onClick={() => onOpenCard(card)}>
                    <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
                    <strong>{card.title}</strong>
                    <IssueMarker card={card} cards={cards} compact />
                    {childrenCount ? <span className="gantt-child-count">{childrenCount} child{childrenCount === 1 ? "" : "ren"}</span> : null}
                    {isDerived ? <span className="gantt-derived-label">Derived dates</span> : null}
                  </button>
                </div>
                <div className="gantt-track">
                  {hasSchedule ? (
                    <span
                      className={`gantt-bar ${card.status}${isDerived ? " derived" : ""}`}
                      style={{ left: `${left}%`, width: `${clampedWidth}%` }}
                    >
                      {start === end ? start : `${start} -> ${end}`}
                    </span>
                  ) : (
                    <span className="gantt-unscheduled">No dates</span>
                  )}
                </div>
              </article>
            );
          })}
          <div className="gantt-axis">
            <span>{bounds.start}</span>
            <span>{bounds.end}</span>
          </div>
        </div>
      ) : (
        <EmptyState
          actionLabel={showUndatedCards ? "Add Card" : "Show Undated"}
          label={
            showUndatedCards
              ? "No cards yet. Add cards to populate the Gantt chart."
              : "No scheduled cards. Add start dates or due dates, or turn on undated cards."
          }
          onAction={showUndatedCards ? () => onStartNewCard("epic", "backlog") : () => setShowUndatedCards(true)}
        />
      )}
    </section>
  );
}

function ProjectCalendar({ cards, onOpenCard, onStartNewCard, project }) {
  const scheduled = getScheduledCards(cards);
  const bounds = getScheduleBounds(scheduled);
  const monthStart = parseLocalDate(bounds.start);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstDay.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return formatDateInput(day);
  });

  if (!project) {
    return <EmptyProjectView label="Create or select a project to see its calendar." />;
  }

  return (
    <section className="overview-workspace">
      <div className="roadmap-header">
        <div>
          <h2>{project.name} Calendar</h2>
          <p>
            {monthStart.toLocaleString(undefined, { month: "long" })} {year}
          </p>
        </div>
      </div>

      {scheduled.length ? (
        <div className="calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div className="calendar-heading" key={day}>{day}</div>
          ))}
          {days.map((day) => {
            const dayCards = scheduled.filter((card) => card.start_date === day || card.due_date === day);
            return (
              <div className={parseLocalDate(day).getMonth() === month ? "calendar-day" : "calendar-day muted"} key={day}>
                <time>{parseLocalDate(day).getDate()}</time>
                {dayCards.map((card) => (
                  <button className="calendar-card" key={`${day}-${card.id}`} type="button" onClick={() => onOpenCard(card)}>
                    <span>{card.start_date === day ? "Start" : "Due"}</span>
                    <strong>{card.title}</strong>
                    <IssueMarker card={card} cards={cards} compact />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          actionLabel="Add Card"
          label="No scheduled cards. Add start dates or due dates to populate the calendar."
          onAction={() => onStartNewCard("epic", "backlog")}
        />
      )}
    </section>
  );
}

function EmptyProjectView({ actionLabel, label, onAction }) {
  return (
    <section className="overview-workspace">
      <EmptyState actionLabel={actionLabel} label={label} onAction={onAction} />
    </section>
  );
}

function EmptyState({ actionLabel, label, onAction }) {
  return (
    <div className="overview-panel empty-overview empty-action-state">
      <p>{label}</p>
      {actionLabel && onAction ? (
        <button className="secondary-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function MetricTile({ label, tone = "", value }) {
  return (
    <div className={`metric-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="progress-bar" aria-label={`${value}% complete`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function ProjectSummaryChips({ summary }) {
  return (
    <div className="summary-chips">
      <span>{summary.total} cards</span>
      <span>{summary.completion}% done</span>
      {summary.nextDueDate ? <span>Next {summary.nextDueDate}</span> : <span>No due date</span>}
      {summary.blocked ? <span className="danger">{summary.blocked} blocked</span> : null}
      {summary.overdue ? <span className="danger">{summary.overdue} overdue</span> : null}
    </div>
  );
}

function CardPreviewPanel({ card, cards, onClose, onEdit, onMoveCard, onOpenCard, onSaveDates }) {
  const [dateDraft, setDateDraft] = useState({
    start_date: card.start_date || "",
    due_date: card.due_date || "",
  });
  const [dateSaveState, setDateSaveState] = useState("");
  const parentCard = cards.find((candidate) => candidate.id === card.parent_id);
  const childCount = cards.filter((candidate) => candidate.parent_id === card.id).length;
  const issues = allCardIssues(card, cards);
  const ganttSchedule = onSaveDates ? ganttScheduleForCard(card, cards) : null;
  const datesChanged = dateDraft.start_date !== (card.start_date || "") || dateDraft.due_date !== (card.due_date || "");
  const datesInvalid = Boolean(dateDraft.start_date && dateDraft.due_date && dateDraft.start_date > dateDraft.due_date);

  useEffect(() => {
    setDateDraft({
      start_date: card.start_date || "",
      due_date: card.due_date || "",
    });
  }, [card.start_date, card.due_date]);

  useEffect(() => {
    setDateSaveState("");
  }, [card.id]);

  async function saveDates() {
    if (datesInvalid) return;
    const saved = await onSaveDates(card, dateDraft);
    if (saved) setDateSaveState("Saved");
  }

  return (
    <aside className="card-preview-panel" aria-label="Selected card preview">
      <header>
        <div>
          <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
          <h2>{card.title}</h2>
        </div>
        <IconButton label="Close preview" onClick={onClose}>
          <ChevronRight size={18} />
        </IconButton>
      </header>

      <div className="preview-meta-grid">
        <div>
          <span>Status</span>
          <strong>{statusLabels[card.status]}</strong>
        </div>
        <div>
          <span>Parent</span>
          <strong>{parentCard ? parentCard.title : "Project root"}</strong>
        </div>
        {!onSaveDates ? (
          <>
            <div>
              <span>Start</span>
              <strong>{card.start_date || "None"}</strong>
            </div>
            <div>
              <span>Due</span>
              <strong>{card.due_date || "None"}</strong>
            </div>
          </>
        ) : null}
        <div>
          <span>Children</span>
          <strong>{childCount}</strong>
        </div>
        <div>
          <span>Deliverables</span>
          <strong>{card.deliverables?.length || 0}</strong>
        </div>
      </div>

      {onSaveDates ? (
        <section className="preview-schedule-editor">
          <header>
            <h3>Schedule</h3>
            {dateSaveState && !datesChanged ? <span>{dateSaveState}</span> : null}
          </header>
          {ganttSchedule?.isDerived ? (
            <div className="preview-derived-bounds">
              <p>Shown on chart as {ganttSchedule.start} to {ganttSchedule.end} using descendant dates.</p>
              {!card.start_date ? (
                <button type="button" onClick={() => onOpenCard(ganttSchedule.startCard)}>
                  Start from {ganttSchedule.startCard.title}
                </button>
              ) : null}
              {!card.due_date ? (
                <button type="button" onClick={() => onOpenCard(ganttSchedule.endCard)}>
                  End from {ganttSchedule.endCard.title}
                </button>
              ) : null}
            </div>
          ) : null}
          <div>
            <label>
              <span>Start Date</span>
              <input
                type="date"
                value={dateDraft.start_date}
                onChange={(event) => {
                  setDateDraft((current) => ({ ...current, start_date: event.target.value }));
                  setDateSaveState("");
                }}
              />
            </label>
            <label>
              <span>End Date</span>
              <input
                type="date"
                min={dateDraft.start_date || undefined}
                value={dateDraft.due_date}
                onChange={(event) => {
                  setDateDraft((current) => ({ ...current, due_date: event.target.value }));
                  setDateSaveState("");
                }}
              />
            </label>
          </div>
          {datesInvalid ? <p className="preview-schedule-error">End date must be on or after start date.</p> : null}
          <button
            className="secondary-button"
            type="button"
            disabled={!datesChanged || datesInvalid}
            onClick={saveDates}
          >
            <Save size={18} />
            <span>Save Dates</span>
          </button>
        </section>
      ) : null}

      {card.description ? <p>{card.description}</p> : <p className="empty-overview">No description.</p>}

      {issues.length ? (
        <section className="preview-issues">
          <h3>Issues</h3>
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.type}-${issue.dependency.id}-${issue.boundary || ""}`}>
                <button type="button" onClick={() => onOpenCard(issue.dependency)}>
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="preview-actions">
        <button className="save-button" type="button" onClick={() => onEdit(card)}>
          <Save size={18} />
          <span>Edit</span>
        </button>
        {card.status !== "blocked" ? (
          <button className="secondary-button" type="button" onClick={() => onMoveCard(card, "blocked")}>
            Mark Blocked
          </button>
        ) : (
          <button className="secondary-button" type="button" onClick={() => onMoveCard(card, "in_progress")}>
            Resume
          </button>
        )}
      </div>
    </aside>
  );
}

function CsvActionsPanel({ activeProject, onClose, onDownloadTemplate, onExport, onImport }) {
  return (
    <aside className="csv-actions-panel" aria-label="Project card CSV actions">
      <header>
        <div>
          <span>Cards CSV</span>
          <h2>Data Tools</h2>
        </div>
        <IconButton label="Close CSV actions" onClick={onClose}>
          <ChevronRight size={18} />
        </IconButton>
      </header>

      <p>
        Export the active project, import cards from a CSV, or download a blank
        template with the expected columns.
      </p>

      <div className="csv-panel-actions">
        <button className="secondary-button" type="button" onClick={onExport} disabled={!activeProject}>
          <Download size={18} />
          <span>Export cards</span>
        </button>
        <button className="secondary-button" type="button" onClick={onImport} disabled={!activeProject}>
          <Upload size={18} />
          <span>Import cards</span>
        </button>
        <button className="secondary-button" type="button" onClick={onDownloadTemplate}>
          <FileText size={18} />
          <span>Download template</span>
        </button>
      </div>
    </aside>
  );
}

function ProjectEditor({ cards, onCancel, onChange, onCreateEpic, onDelete, onOpenCard, onSubmit, project }) {
  const epicCards = cards.filter((card) => card.card_type === "epic");

  return (
    <div className="editor-backdrop" role="presentation">
      <form className="card-editor" onSubmit={onSubmit}>
        <header>
          <h2>Project Card</h2>
          <div>
            <IconButton label="Delete project" onClick={() => onDelete(project)}>
              <Trash2 size={18} />
            </IconButton>
            <button className="save-button" type="submit">
              <Save size={18} />
              <span>Save</span>
            </button>
          </div>
        </header>

        <label>
          <span>Name</span>
          <input value={project.name} onChange={(event) => onChange({ ...project, name: event.target.value })} required />
        </label>

        <label>
          <span>Description</span>
          <textarea
            value={project.description || ""}
            onChange={(event) => onChange({ ...project, description: event.target.value })}
          />
        </label>

        <section className="relationship-panel">
          <div>
            <span>Root</span>
            <strong>Project</strong>
          </div>
          <div>
            <span>Epics</span>
            <strong>{epicCards.length}</strong>
          </div>
          <div>
            <span>Next Level</span>
            <strong>Epic</strong>
          </div>
        </section>

        <InlineChildCreator
          label="Add Epic"
          placeholder="Epic name"
          onCreate={(title) => onCreateEpic(project, title)}
        />

        {epicCards.length ? (
          <section className="child-card-list">
            <h3>Linked Epics</h3>
            {epicCards.map((epic) => (
              <button className="linked-card" key={epic.id} type="button" onClick={() => onOpenCard(epic)}>
                <span className={`card-type ${epic.card_type}`}>{cardTypeLabels[epic.card_type]}</span>
                <strong>{epic.title}</strong>
                <span>{statusLabels[epic.status]}</span>
              </button>
            ))}
          </section>
        ) : null}

        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </div>
  );
}

function CardEditor({
  activity,
  card,
  cards,
  onAssignToPlanner,
  onCancel,
  onChange,
  onCreateChild,
  onDelete,
  onLoadPlannerEntry,
  onSubmit,
}) {
  const defaultPlannerDate = card.due_date || card.start_date || formatDateInput(new Date());
  const [plannerDate, setPlannerDate] = useState(defaultPlannerDate);
  const [plannerEntry, setPlannerEntry] = useState(null);
  const [plannerLookupStatus, setPlannerLookupStatus] = useState("");
  const [plannerAssignStatus, setPlannerAssignStatus] = useState("");
  const [isAssigningPlanner, setIsAssigningPlanner] = useState(false);
  const [isDependenciesOpen, setIsDependenciesOpen] = useState(false);
  const expectedParentType = parentTypeByCardType[card.card_type];
  const childType = childTypeByCardType[card.card_type];
  const parentCard = cards.find((candidate) => candidate.id === card.parent_id);
  const childCards = card.id ? cards.filter((candidate) => candidate.parent_id === card.id) : [];
  const dependencyIds = card.dependency_ids || [];
  const dependencyOptions = cards.filter((candidate) => candidate.id !== card.id);
  const dependencyIssues = allCardIssues(card, cards);
  const hierarchyShift = hierarchyShiftForCard(card, card.card_type, cards);
  const parentOptions = cards.filter(
    (candidate) => candidate.id !== card.id && candidate.card_type === expectedParentType,
  );
  const deliverables = card.deliverables.length ? card.deliverables : [""];

  useEffect(() => {
    setPlannerDate(defaultPlannerDate);
    setPlannerAssignStatus("");
    setPlannerEntry(null);
    setPlannerLookupStatus("");
    setIsDependenciesOpen(false);
  }, [card.id, defaultPlannerDate]);

  useEffect(() => {
    let isCurrent = true;
    setPlannerLookupStatus("");
    setPlannerEntry(null);
    if (!plannerDate || !onLoadPlannerEntry) return () => {};

    onLoadPlannerEntry(plannerDate)
      .then((entry) => {
        if (isCurrent) setPlannerEntry(normalizeEntry(entry, plannerDate));
      })
      .catch(() => {
        if (isCurrent) setPlannerLookupStatus("Could not check this date.");
      });

    return () => {
      isCurrent = false;
    };
  }, [card.id, onLoadPlannerEntry, plannerDate]);

  function updateField(field, value) {
    onChange({ ...card, [field]: value });
  }

  function updateCardType(value) {
    const nextParentType = parentTypeByCardType[value];
    const currentParent = cards.find((candidate) => candidate.id === card.parent_id);
    onChange({
      ...card,
      card_type: value,
      parent_id: currentParent?.card_type === nextParentType ? card.parent_id : "",
    });
  }

  function updateDeliverable(index, value) {
    const next = [...deliverables];
    next[index] = value;
    onChange({ ...card, deliverables: next });
  }

  function addDeliverable() {
    onChange({ ...card, deliverables: [...deliverables, ""] });
  }

  function removeDeliverable(index) {
    const next = deliverables.filter((_, itemIndex) => itemIndex !== index);
    onChange({ ...card, deliverables: next.length ? next : [""] });
  }

  function toggleDependency(dependencyId) {
    onChange({
      ...card,
      dependency_ids: dependencyIds.includes(dependencyId)
        ? dependencyIds.filter((item) => item !== dependencyId)
        : [...dependencyIds, dependencyId],
    });
  }

  async function assignToPlanner() {
    setIsAssigningPlanner(true);
    setPlannerAssignStatus("");
    const result = await onAssignToPlanner(card, plannerDate);
    if (result.entry) {
      setPlannerEntry(normalizeEntry(result.entry, plannerDate));
    }
    setPlannerAssignStatus(result.message);
    setIsAssigningPlanner(false);
  }

  const plannerPriorities = (plannerEntry?.priorities || []).filter((priority) => priority.trim());
  const plannerLinkedCardIds = (plannerEntry?.priority_card_ids || []).filter(Boolean);
  const existingAssignmentIndex = (plannerEntry?.priority_card_ids || []).findIndex((cardId) => cardId === card.id);
  const hasOpenPlannerSlot = plannerPriorities.length < PRIORITY_COUNT || existingAssignmentIndex !== -1;
  const linkedCardsOnDate = plannerLinkedCardIds
    .map((cardId) => cards.find((candidate) => candidate.id === cardId))
    .filter(Boolean);

  return (
    <div className="editor-backdrop" role="presentation">
      <form className="card-editor" onSubmit={onSubmit}>
        <header>
          <h2>{card.id ? "Edit Card" : "New Card"}</h2>
          <div>
            <IconButton label="Delete card" onClick={onDelete}>
              <Trash2 size={18} />
            </IconButton>
            <button className="save-button" type="submit">
              <Save size={18} />
              <span>Save</span>
            </button>
          </div>
        </header>

        <label>
          <span>Title</span>
          <input value={card.title} onChange={(event) => updateField("title", event.target.value)} required />
        </label>

        <div className="editor-grid">
          <label>
            <span>Type</span>
            <select value={card.card_type} onChange={(event) => updateCardType(event.target.value)}>
              {CARD_TYPES.map((type) => (
                <option key={type} value={type} disabled={hierarchyShiftForCard(card, type, cards)?.isBlocked}>
                  {cardTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={card.status} onChange={(event) => updateField("status", event.target.value)}>
              {STATUSES.map((statusValue) => (
                <option key={statusValue} value={statusValue}>
                  {statusLabels[statusValue]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Start Date</span>
            <input
              value={card.start_date || ""}
              type="date"
              onChange={(event) => updateField("start_date", event.target.value)}
            />
          </label>
          <label>
            <span>Due Date</span>
            <input
              value={card.due_date || ""}
              type="date"
              min={card.start_date || undefined}
              onChange={(event) => updateField("due_date", event.target.value)}
            />
          </label>
          <label>
            <span>{expectedParentType ? `Parent ${cardTypeLabels[expectedParentType]}` : "Parent"}</span>
            {expectedParentType ? (
              <select value={card.parent_id || ""} onChange={(event) => updateField("parent_id", event.target.value)} required>
                <option value="">Select {cardTypeLabels[expectedParentType]}</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            ) : (
              <input value="Project root" disabled readOnly />
            )}
          </label>
        </div>

        <section className="relationship-panel">
          <div>
            <span>Parent</span>
            <strong>{parentCard ? `${cardTypeLabels[parentCard.card_type]}: ${parentCard.title}` : "Project root"}</strong>
          </div>
          <div>
            <span>Children</span>
            <strong>{childCards.length}</strong>
          </div>
          {childType ? (
            <div>
              <span>Next Level</span>
              <strong>{cardTypeLabels[childType]}</strong>
            </div>
          ) : null}
        </section>

        {hierarchyShift?.descendants.length ? (
          <section className="hierarchy-shift-panel">
            <GitBranch size={18} />
            <p>
              Saving moves {hierarchyShift.descendants.length} descendant
              {hierarchyShift.descendants.length === 1 ? "" : "s"} {hierarchyShift.direction}{" "}
              {hierarchyShift.levels} level{hierarchyShift.levels === 1 ? "" : "s"}.
            </p>
          </section>
        ) : null}

        <section className="planner-assignment-panel">
          <header>
            <div>
              <CalendarDays size={18} />
              <h3>Planner Assignment</h3>
            </div>
            <span>Priority slot</span>
          </header>
          <div>
            <label>
              <span>Date</span>
              <input
                min={formatDateInput(new Date())}
                type="date"
                value={plannerDate}
                onChange={(event) => setPlannerDate(event.target.value)}
              />
            </label>
            <button
              className="secondary-button"
              disabled={isAssigningPlanner || !card.title.trim() || !plannerDate}
              type="button"
              onClick={assignToPlanner}
            >
              <CalendarDays size={18} />
              <span>{isAssigningPlanner ? "Assigning" : "Assign"}</span>
            </button>
          </div>
          <div className="planner-capacity-summary">
            <span>{plannerPriorities.length} of {PRIORITY_COUNT} priority slots used</span>
            {plannerLookupStatus ? <strong>{plannerLookupStatus}</strong> : null}
            {!hasOpenPlannerSlot ? <strong>{plannerDate} is full.</strong> : null}
            {existingAssignmentIndex !== -1 ? <strong>This card is already priority {existingAssignmentIndex + 1} on this date.</strong> : null}
            {linkedCardsOnDate.length > 1 ? (
              <strong>{linkedCardsOnDate.length} linked cards are assigned to this date.</strong>
            ) : null}
            {plannerPriorities.length ? (
              <ul>
                {plannerPriorities.map((priority, index) => (
                  <li key={`${priority}-${index}`}>
                    <span>{index + 1}</span>
                    <p>{priority}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {plannerAssignStatus ? <p>{plannerAssignStatus}</p> : null}
        </section>

        {dependencyIssues.length ? (
          <section className="card-warning-panel">
            <header>
              <AlertCircle size={18} />
              <h3>Dependency Warnings</h3>
            </header>
            <ul>
              {dependencyIssues.map((issue) => (
                <li key={`${issue.type}-${issue.dependency.id}-${issue.boundary || ""}`}>{issue.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="dependencies-editor">
          <button
            className="collapsible-section-header"
            type="button"
            onClick={() => setIsDependenciesOpen((current) => !current)}
            aria-expanded={isDependenciesOpen}
          >
            <div>
              <GitBranch size={18} />
              <h3>Dependencies</h3>
            </div>
            <span>{isDependenciesOpen ? "Hide" : "Show"} | {dependencyIds.length} linked</span>
          </button>
          {isDependenciesOpen ? (
            dependencyOptions.length ? (
              <div className="dependency-list">
                {dependencyOptions.map((dependency) => (
                  <label className="dependency-option" key={dependency.id}>
                    <input
                      checked={dependencyIds.includes(dependency.id)}
                      type="checkbox"
                      onChange={() => toggleDependency(dependency.id)}
                    />
                    <span className={`card-type ${dependency.card_type}`}>{cardTypeLabels[dependency.card_type]}</span>
                    <strong>{dependency.title}</strong>
                    <span>{statusLabels[dependency.status]}</span>
                    {dependency.due_date ? <span>Due {dependency.due_date}</span> : <span>No due date</span>}
                  </label>
                ))}
              </div>
            ) : (
              <p className="empty-overview">No other cards available.</p>
            )
          ) : null}
        </section>

        {childType ? (
          <InlineChildCreator
            disabled={!card.id}
            label={`Add ${cardTypeLabels[childType]}`}
            placeholder={`${cardTypeLabels[childType]} name`}
            onCreate={(title) => onCreateChild(card, title)}
          />
        ) : null}

        {childCards.length ? (
          <section className="child-card-list">
            <h3>Linked Child Cards</h3>
            {childCards.map((child) => (
              <button className="linked-card" key={child.id} type="button" onClick={() => onChange(child)}>
                <span className={`card-type ${child.card_type}`}>{cardTypeLabels[child.card_type]}</span>
                <strong>{child.title}</strong>
                <span>{statusLabels[child.status]}</span>
              </button>
            ))}
          </section>
        ) : null}

        <label>
          <span>Description</span>
          <textarea value={card.description || ""} onChange={(event) => updateField("description", event.target.value)} />
        </label>

        <section className="comments-editor">
          <label>
            <span>Comments</span>
            <textarea
              value={card.comments || ""}
              onChange={(event) => updateField("comments", event.target.value)}
              placeholder={"Markdown supported. Use ```mermaid or ```mmd fenced blocks for Mermaid source."}
            />
          </label>
          <MarkdownPreview value={card.comments || ""} />
        </section>

        <section className="deliverables-editor">
          <header>
            <h3>Deliverables</h3>
            <IconButton label="Add deliverable" onClick={addDeliverable}>
              <Plus size={18} />
            </IconButton>
          </header>
          {deliverables.map((deliverable, index) => (
            <div className="deliverable-row" key={index}>
              <input value={deliverable} onChange={(event) => updateDeliverable(index, event.target.value)} />
              <IconButton label="Remove deliverable" onClick={() => removeDeliverable(index)}>
                <Trash2 size={18} />
              </IconButton>
            </div>
          ))}
        </section>

        {card.id ? <CardActivity activity={activity} cards={cards} /> : null}

        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </div>
  );
}

function CardActivity({ activity, cards }) {
  return (
    <section className="activity-editor">
      <header>
        <div>
          <Clock size={18} />
          <h3>Activity</h3>
        </div>
        <span>{activity.length} changes</span>
      </header>
      {activity.length ? (
        <ol className="activity-list">
          {activity.map((item) => (
            <li key={item.id}>
              <time>{formatDateTime(item.created_at)}</time>
              <strong>{activityFieldLabels[item.field_name] || item.field_name}</strong>
              <span>
                {formatActivityValue(item.field_name, item.old_value, cards)} {"->"}{" "}
                {formatActivityValue(item.field_name, item.new_value, cards)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-overview">No tracked changes yet.</p>
      )}
    </section>
  );
}

function InlineChildCreator({ disabled = false, label, onCreate, placeholder }) {
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function createChild() {
    if (disabled || !title.trim() || isSaving) return;

    setIsSaving(true);
    const saved = await onCreate(title);
    setIsSaving(false);
    if (saved) {
      setTitle("");
    }
  }

  return (
    <div className="inline-child-creator">
      <label>
        <span>{label}</span>
        <input
          disabled={disabled || isSaving}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              createChild();
            }
          }}
          placeholder={placeholder}
        />
      </label>
      <button className="secondary-button" disabled={disabled || isSaving || !title.trim()} type="button" onClick={createChild}>
        <Plus size={18} />
        <span>Add</span>
      </button>
    </div>
  );
}

function MarkdownPreview({ value }) {
  return (
    <section className="markdown-preview">
      <header>
        <h3>Preview</h3>
        <span>Markdown / MMD</span>
      </header>
      {value.trim() ? (
        <div dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }} />
      ) : (
        <p className="empty-overview">No comments yet.</p>
      )}
    </section>
  );
}

function StatusLine({ error, label }) {
  return (
    <div className={`status-line ${error ? "status-error" : ""}`}>
      {error ? <AlertCircle size={16} /> : <Check size={16} />}
      <span>{label}</span>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
