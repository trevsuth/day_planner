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
  GitBranch,
  FolderKanban,
  ListChecks,
  Map,
  NotebookPen,
  Plus,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import "./styles.css";

const TASK_COUNT = 5;
const PRIORITY_COUNT = 3;
const STATUSES = ["backlog", "in_progress", "blocked", "done"];
const CARD_TYPES = ["epic", "feature", "story", "subtask"];

const statusLabels = {
  backlog: "Backlog",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

const cardTypeLabels = {
  epic: "Epic",
  feature: "Feature",
  story: "Story",
  subtask: "Subtask",
};

const parentTypeByCardType = {
  epic: null,
  feature: "epic",
  story: "feature",
  subtask: "story",
};

const childTypeByCardType = {
  epic: "feature",
  feature: "story",
  story: "subtask",
  subtask: null,
};

const PROJECT_STATE_STORAGE_KEY = "dailyPlanner.projectState";

const statusOrder = {
  backlog: 0,
  in_progress: 1,
  blocked: 2,
  done: 3,
};

const PROJECT_VIEWS = ["portfolio", "issues", "roadmap", "timeline", "gantt", "calendar", "board"];

const defaultProjectFilters = {
  query: "",
  cardTypes: [],
  statuses: [],
  schedule: "all",
};

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value, amount) {
  const next = parseLocalDate(value);
  next.setDate(next.getDate() + amount);
  return formatDateInput(next);
}

function displayDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseLocalDate(value));
}

function normalizeEntry(entry, entryDate) {
  const priorities = [...(entry.priorities ?? [])];
  const tasks = [...(entry.tasks ?? [])];

  while (priorities.length < PRIORITY_COUNT) priorities.push("");
  while (tasks.length < TASK_COUNT) tasks.push({ text: "", completed: false });

  return {
    entry_date: entry.entry_date ?? entryDate,
    priorities: priorities.slice(0, PRIORITY_COUNT),
    tasks: tasks.slice(0, TASK_COUNT),
    schedule: entry.schedule ?? "",
    notes: entry.notes ?? "",
  };
}

function compactEntry(entry) {
  return {
    entry_date: entry.entry_date,
    priorities: entry.priorities.map((item) => item.trim()).filter(Boolean),
    tasks: entry.tasks
      .map((task) => ({ text: task.text.trim(), completed: task.completed }))
      .filter((task) => task.text),
    schedule: entry.schedule,
    notes: entry.notes,
  };
}

function emptyCard(projectId) {
  return {
    project_id: projectId,
    card_type: "epic",
    title: "",
    description: "",
    comments: "",
    status: "backlog",
    start_date: "",
    due_date: "",
    parent_id: "",
    dependency_ids: [],
    deliverables: [""],
  };
}

function plannerPriorityText(card, project) {
  const prefix = project?.name ? `${project.name} - ` : "";
  return `${prefix}${cardTypeLabels[card.card_type]}: ${card.title}`.trim();
}

function loadStoredProjectState() {
  try {
    return JSON.parse(window.localStorage.getItem(PROJECT_STATE_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function cardStart(card) {
  return card.start_date || card.due_date || "";
}

function cardEnd(card) {
  return card.due_date || card.start_date || "";
}

function daysBetween(start, end) {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  return Math.round((endDate - startDate) / 86400000);
}

function getScheduledCards(cards) {
  return cards.filter((card) => card.start_date || card.due_date);
}

function getScheduleBounds(cards) {
  const scheduled = getScheduledCards(cards);
  if (!scheduled.length) {
    const today = formatDateInput(new Date());
    return { start: today, end: addDays(today, 30) };
  }

  const starts = scheduled.map(cardStart).filter(Boolean).sort();
  const ends = scheduled.map(cardEnd).filter(Boolean).sort();
  const start = starts[0];
  const end = ends[ends.length - 1];
  return { start, end: end < start ? start : end };
}

function getTimelinePoints(cards) {
  return getScheduledCards(cards)
    .flatMap((card) => [
      card.start_date ? { date: card.start_date, kind: "Start", card } : null,
      card.due_date ? { date: card.due_date, kind: "Due", card } : null,
    ])
    .filter(Boolean)
    .sort((first, second) => first.date.localeCompare(second.date) || first.card.title.localeCompare(second.card.title));
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

function cardRelationshipLabel(card, cards) {
  const parent = cards.find((candidate) => candidate.id === card.parent_id);
  if (!parent) return "No parent";
  return `${cardTypeLabels[parent.card_type]}: ${parent.title}`;
}

function isOverdue(card) {
  return Boolean(card.due_date && card.status !== "done" && card.due_date < formatDateInput(new Date()));
}

function isDueSoon(card) {
  const today = formatDateInput(new Date());
  const soon = addDays(today, 14);
  return Boolean(card.due_date && card.status !== "done" && card.due_date >= today && card.due_date <= soon);
}

function cardMatchesFilters(card, filters) {
  if (filters.cardTypes.length && !filters.cardTypes.includes(card.card_type)) return false;
  if (filters.statuses.length && !filters.statuses.includes(card.status)) return false;

  if (filters.schedule === "blocked" && card.status !== "blocked") return false;
  if (filters.schedule === "overdue" && !isOverdue(card)) return false;
  if (filters.schedule === "due_soon" && !isDueSoon(card)) return false;
  if (filters.schedule === "undated" && (card.start_date || card.due_date)) return false;

  const query = filters.query.trim().toLowerCase();
  if (!query) return true;

  const searchable = [
    card.title,
    card.description,
    card.comments,
    ...(card.deliverables || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(query);
}

function dependencyCardsFor(card, cards) {
  const dependencyIds = card.dependency_ids || [];
  return dependencyIds.map((dependencyId) => cards.find((candidate) => candidate.id === dependencyId)).filter(Boolean);
}

function cardDependencyIssues(card, cards) {
  const issues = [];
  const dependencies = dependencyCardsFor(card, cards);

  dependencies.forEach((dependency) => {
    if (dependency.status === "blocked" && card.status !== "done") {
      issues.push({
        type: "blocked_dependency",
        severity: "warning",
        dependency,
        message: `Depends on blocked card "${dependency.title}".`,
      });
    }

    if (dependency.due_date && card.start_date && card.start_date < dependency.due_date) {
      issues.push({
        type: "date_conflict",
        severity: "warning",
        dependency,
        message: `Starts ${card.start_date} before dependency "${dependency.title}" is due ${dependency.due_date}.`,
      });
    } else if (dependency.due_date && card.due_date && card.due_date < dependency.due_date) {
      issues.push({
        type: "date_conflict",
        severity: "warning",
        dependency,
        message: `Due ${card.due_date} before dependency "${dependency.title}" is due ${dependency.due_date}.`,
      });
    }
  });

  return issues;
}

function projectIssuesForCards(cards) {
  return cards
    .map((card) => ({
      card,
      issues: cardDependencyIssues(card, cards),
    }))
    .filter((item) => item.issues.length);
}

function summarizeCards(cards) {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const byType = Object.fromEntries(CARD_TYPES.map((type) => [type, 0]));
  let overdue = 0;
  let dueSoon = 0;
  let nextDueDate = "";
  const today = formatDateInput(new Date());
  const soon = addDays(today, 14);

  for (const card of cards) {
    byStatus[card.status] += 1;
    byType[card.card_type] += 1;
    if (isOverdue(card)) overdue += 1;
    if (card.due_date && card.status !== "done" && card.due_date >= today && card.due_date <= soon) dueSoon += 1;
    if (card.due_date && card.status !== "done" && (!nextDueDate || card.due_date < nextDueDate)) {
      nextDueDate = card.due_date;
    }
  }

  return {
    total: cards.length,
    byStatus,
    byType,
    blocked: byStatus.blocked,
    done: byStatus.done,
    overdue,
    dueSoon,
    nextDueDate,
    completion: cards.length ? Math.round((byStatus.done / cards.length) * 100) : 0,
  };
}

function sortCardsForRoadmap(cards) {
  return [...cards].sort((first, second) => {
    const firstDue = first.due_date || "9999-12-31";
    const secondDue = second.due_date || "9999-12-31";
    if (firstDue !== secondDue) return firstDue.localeCompare(secondDue);
    return statusOrder[first.status] - statusOrder[second.status] || first.title.localeCompare(second.title);
  });
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

      {activeTab === "planner" ? <PlannerApp /> : null}
      {activeTab === "projects" ? <ProjectsApp /> : null}
      {activeTab === "api" ? <ApiReference /> : null}
    </main>
  );
}

function PlannerApp() {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [entryDate, setEntryDate] = useState(today);
  const [entry, setEntry] = useState(() => normalizeEntry({}, today));
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEntry() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetch(`/api/planner/entries/${entryDate}`);
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setEntry(normalizeEntry(data, entryDate));
          setStatus("idle");
        }
      } catch (err) {
        if (!cancelled) {
          setEntry(normalizeEntry({}, entryDate));
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

  function updateEntry(updater) {
    setEntry((current) => updater({ ...current }));
  }

  async function saveEntry() {
    const payload = compactEntry(entry);
    setStatus("saving");
    setError("");

    try {
      const response = await fetch(`/api/planner/entries/${entryDate}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const data = await response.json();
      setEntry(normalizeEntry(data, entryDate));
      setStatus("saved");
      window.setTimeout(() => setStatus((current) => (current === "saved" ? "idle" : current)), 1500);
    } catch (err) {
      setStatus("error");
      setError("Could not save this planner entry.");
    }
  }

  async function moveDay(amount) {
    if (status !== "loading") {
      await saveEntry();
    }
    setEntryDate((current) => addDays(current, amount));
  }

  const statusLabel =
    status === "loading"
      ? "Loading"
      : status === "saving"
        ? "Saving"
        : status === "saved"
          ? "Saved"
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
            onChange={(event) => setEntryDate(event.target.value)}
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
            {entry.priorities.map((priority, index) => (
              <label className="priority-row" key={index}>
                <span>{index + 1}</span>
                <input
                  value={priority}
                  onChange={(event) =>
                    updateEntry((current) => {
                      const priorities = [...current.priorities];
                      priorities[index] = event.target.value;
                      return { ...current, priorities };
                    })
                  }
                  placeholder="Priority"
                />
              </label>
            ))}
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

function ProjectsApp() {
  const storedProjectState = useMemo(loadStoredProjectState, []);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(storedProjectState.activeProjectId || "");
  const [cards, setCards] = useState([]);
  const [projectCardsById, setProjectCardsById] = useState({});
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
  const [status, setStatus] = useState("Loading");
  const [error, setError] = useState("");
  const projectNameInputRef = useRef(null);
  const searchInputRef = useRef(null);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const filteredCards = cards.filter((card) => cardMatchesFilters(card, projectFilters));
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
    if (activeProjectId) {
      loadCards(activeProjectId);
    } else {
      setCards([]);
    }
  }, [activeProjectId]);

  useEffect(() => {
    window.localStorage.setItem(
      PROJECT_STATE_STORAGE_KEY,
      JSON.stringify({
        activeProjectId,
        projectView,
        projectFilters,
      }),
    );
  }, [activeProjectId, projectFilters, projectView]);

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
        searchInputRef.current?.focus();
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

  async function request(path, options = {}) {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || `Request failed with ${response.status}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

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
    if (card) setSelectedCard(card);
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
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveCardToStatus(card, nextStatus) {
    if (!card || card.status === nextStatus) return;

    const payload = {
      card_type: card.card_type,
      title: card.title,
      description: card.description || null,
      comments: card.comments || null,
      status: nextStatus,
      start_date: card.start_date || null,
      due_date: card.due_date || null,
      parent_id: card.parent_id || null,
      dependency_ids: card.dependency_ids || [],
      deliverables: card.deliverables || [],
    };

    try {
      const saved = await request(`/api/projmgmt/cards/${card.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setCards((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setProjectCardsById((current) => ({
        ...current,
        [saved.project_id]: (current[saved.project_id] || []).map((item) => (item.id === saved.id ? saved : item)),
      }));
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
      const entry = await request(`/api/planner/entries/${plannerDate}`);
      const normalized = normalizeEntry(entry, plannerDate);
      const priority = plannerPriorityText(card, activeProject);
      const existingIndex = normalized.priorities.findIndex((item) => item.trim() === priority);

      if (existingIndex >= 0) {
        return { ok: true, message: `Already assigned to priority ${existingIndex + 1}.` };
      }

      const openIndex = normalized.priorities.findIndex((item) => !item.trim());
      if (openIndex < 0) {
        return { ok: false, message: `${plannerDate} has no open priority slots.` };
      }

      const priorities = [...normalized.priorities];
      priorities[openIndex] = priority;
      await request(`/api/planner/entries/${plannerDate}`, {
        method: "PUT",
        body: JSON.stringify(compactEntry({ ...normalized, priorities })),
      });

      return { ok: true, message: `Assigned to ${plannerDate} priority ${openIndex + 1}.` };
    } catch (err) {
      return { ok: false, message: err.message || "Could not assign card to planner." };
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
        <button className="save-button" type="button" onClick={() => startNewCard()} disabled={!activeProjectId}>
          <Plus size={18} />
          <span>Card</span>
        </button>
        <button className="secondary-button" type="button" onClick={() => openProjectCard(activeProject)} disabled={!activeProject}>
          <FolderKanban size={18} />
          <span>Project Card</span>
        </button>
      </header>

      <StatusLine error={error} label={error || status} />

      <nav className="project-view-tabs" aria-label="Project management views">
        <button className={projectView === "portfolio" ? "active" : ""} type="button" onClick={() => setProjectView("portfolio")}>
          <BarChart3 size={17} />
          <span>Portfolio</span>
        </button>
        <button className={projectView === "issues" ? "active" : ""} type="button" onClick={() => setProjectView("issues")}>
          <AlertCircle size={17} />
          <span>Issues</span>
        </button>
        <button className={projectView === "roadmap" ? "active" : ""} type="button" onClick={() => setProjectView("roadmap")}>
          <Map size={17} />
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

      <ProjectFilters
        filters={projectFilters}
        hasActiveFilters={hasActiveFilters}
        onClear={clearProjectFilters}
        onQueryChange={(value) => updateProjectFilter("query", value)}
        onScheduleChange={(value) => updateProjectFilter("schedule", value)}
        onToggleCardType={(value) => toggleProjectFilter("cardTypes", value)}
        onToggleStatus={(value) => toggleProjectFilter("statuses", value)}
        resultCount={filteredCards.length}
        searchInputRef={searchInputRef}
        totalCount={cards.length}
      />

      <div className="projects-layout">
        <aside className="project-sidebar">
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
                <button type="button" onClick={() => setActiveProjectId(project.id)}>
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
        </aside>

        {projectView === "portfolio" ? (
          <PortfolioOverview
            cardsByProjectId={hasActiveFilters ? filteredProjectCardsById : projectCardsById}
            onOpenProject={openProjectCard}
            projects={projects}
            selectedProjectId={activeProjectId}
            setActiveProjectId={setActiveProjectId}
          />
        ) : null}

        {projectView === "roadmap" ? (
          <ProjectRoadmap
            cards={filteredCards}
            onCreateEpic={() => startNewCard("epic", "backlog")}
            onOpenCard={setSelectedCard}
            project={activeProject}
          />
        ) : null}

        {projectView === "issues" ? (
          <ProjectIssues cards={filteredCards} onOpenCard={setSelectedCard} project={activeProject} />
        ) : null}

        {projectView === "board" ? (
          <ProjectBoard
            cards={filteredCards}
            onMoveCard={moveCardToStatus}
            onOpenCard={setSelectedCard}
            onStartNewCard={startNewCard}
            selectedCardId={keyboardCardId}
          />
        ) : null}

        {projectView === "timeline" ? (
          <ProjectTimeline cards={filteredCards} onOpenCard={setSelectedCard} project={activeProject} />
        ) : null}

        {projectView === "gantt" ? (
          <ProjectGantt cards={filteredCards} onOpenCard={setSelectedCard} project={activeProject} />
        ) : null}

        {projectView === "calendar" ? (
          <ProjectCalendar cards={filteredCards} onOpenCard={setSelectedCard} project={activeProject} />
        ) : null}
      </div>

      {selectedCard ? (
        <CardEditor
          card={selectedCard}
          cards={cards}
          onCancel={() => setSelectedCard(null)}
          onChange={setSelectedCard}
          onAssignToPlanner={assignCardToPlanner}
          onCreateChild={(parent, title) => createInlineCard({ parent, title })}
          onDelete={deleteSelectedCard}
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
    method: "PUT",
    path: "/api/projmgmt/cards/{card_id}",
    purpose: "Update card details, status, hierarchy, dates, comments, and deliverables.",
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

function ProjectFilters({
  filters,
  hasActiveFilters,
  onClear,
  onQueryChange,
  onScheduleChange,
  onToggleCardType,
  onToggleStatus,
  resultCount,
  searchInputRef,
  totalCount,
}) {
  return (
    <section className="project-filter-panel" aria-label="Project filters">
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
        <span>
          {resultCount} of {totalCount} cards
        </span>
        {hasActiveFilters ? (
          <button className="secondary-button" type="button" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      <p className="project-shortcuts">
        / search | J/K select | Enter open | Alt+1-7 views | Alt+0 clear
      </p>
    </section>
  );
}

function ProjectBoard({ cards, onMoveCard, onOpenCard, onStartNewCard, selectedCardId }) {
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

function ProjectCardButton({ card, cards, isSelected, onOpenCard }) {
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
  const issues = cardDependencyIssues(card, cards);
  if (!issues.length) return null;
  return (
    <span className={compact ? "issue-badge compact" : "issue-badge"}>
      {issues.length} issue{issues.length === 1 ? "" : "s"}
    </span>
  );
}

function ProjectIssues({ cards, onOpenCard, project }) {
  const issueGroups = projectIssuesForCards(cards);
  const blockedCount = issueGroups.reduce(
    (total, group) => total + group.issues.filter((issue) => issue.type === "blocked_dependency").length,
    0,
  );
  const dateConflictCount = issueGroups.reduce(
    (total, group) => total + group.issues.filter((issue) => issue.type === "date_conflict").length,
    0,
  );

  if (!project) {
    return <div className="overview-panel empty-overview">Create or select a project to see dependency issues.</div>;
  }

  return (
    <section className="overview-workspace">
      <div className="overview-summary-grid">
        <MetricTile label="Cards With Issues" tone={issueGroups.length ? "danger" : ""} value={issueGroups.length} />
        <MetricTile label="Blocked Dependencies" tone={blockedCount ? "danger" : ""} value={blockedCount} />
        <MetricTile label="Date Conflicts" tone={dateConflictCount ? "danger" : ""} value={dateConflictCount} />
      </div>

      <section className="overview-panel issues-panel">
        <header>
          <h2>Issues</h2>
          <span>{project.name}</span>
        </header>
        {issueGroups.length ? (
          <div className="issues-list">
            {issueGroups.map(({ card, issues }) => (
              <button className="issue-row" key={card.id} type="button" onClick={() => onOpenCard(card)}>
                <div>
                  <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
                  <strong>{card.title}</strong>
                </div>
                <ul>
                  {issues.map((issue) => (
                    <li key={`${issue.type}-${issue.dependency.id}`}>{issue.message}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-overview">No blocked dependencies or date conflicts.</p>
        )}
      </section>
    </section>
  );
}

function PortfolioOverview({ cardsByProjectId, onOpenProject, projects, selectedProjectId, setActiveProjectId }) {
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
            {projects.map((project) => {
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
            })}
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
              <p className="empty-overview">No blocked or overdue work.</p>
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
        <div className="overview-panel empty-overview">No epics yet. Add an epic to start the roadmap.</div>
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

function ProjectTimeline({ cards, onOpenCard, project }) {
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
        <div className="overview-panel empty-overview">No scheduled cards. Add start dates or due dates to populate the timeline.</div>
      )}
    </section>
  );
}

function ProjectGantt({ cards, onOpenCard, project }) {
  const scheduled = sortCardsForRoadmap(getScheduledCards(cards));
  const bounds = getScheduleBounds(scheduled);
  const totalDays = Math.max(daysBetween(bounds.start, bounds.end), 1);

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
      </div>

      {scheduled.length ? (
        <div className="gantt-chart">
          <div className="gantt-axis">
            <span>{bounds.start}</span>
            <span>{bounds.end}</span>
          </div>
          {scheduled.map((card) => {
            const start = cardStart(card);
            const end = cardEnd(card);
            const offset = Math.max(daysBetween(bounds.start, start), 0);
            const duration = Math.max(daysBetween(start, end), 0);
            const left = (offset / totalDays) * 100;
            const width = Math.max(((duration || 1) / totalDays) * 100, 3);
            return (
              <button className="gantt-row" key={card.id} type="button" onClick={() => onOpenCard(card)}>
                <div>
                  <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
                  <strong>{card.title}</strong>
                  <IssueMarker card={card} cards={cards} compact />
                </div>
                <div className="gantt-track">
                  <span
                    className={`gantt-bar ${card.status}`}
                    style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                  >
                    {start === end ? start : `${start} -> ${end}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overview-panel empty-overview">No scheduled cards. Add start dates or due dates to populate the Gantt chart.</div>
      )}
    </section>
  );
}

function ProjectCalendar({ cards, onOpenCard, project }) {
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
        <div className="overview-panel empty-overview">No scheduled cards. Add start dates or due dates to populate the calendar.</div>
      )}
    </section>
  );
}

function EmptyProjectView({ label }) {
  return (
    <section className="overview-workspace">
      <div className="overview-panel empty-overview">{label}</div>
    </section>
  );
}

function collectDescendants(parentId, cards) {
  const directChildren = cards.filter((card) => card.parent_id === parentId);
  return directChildren.flatMap((child) => [child, ...collectDescendants(child.id, cards)]);
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

function CardEditor({ card, cards, onAssignToPlanner, onCancel, onChange, onCreateChild, onDelete, onSubmit }) {
  const defaultPlannerDate = card.due_date || card.start_date || formatDateInput(new Date());
  const [plannerDate, setPlannerDate] = useState(defaultPlannerDate);
  const [plannerAssignStatus, setPlannerAssignStatus] = useState("");
  const [isAssigningPlanner, setIsAssigningPlanner] = useState(false);
  const expectedParentType = parentTypeByCardType[card.card_type];
  const childType = childTypeByCardType[card.card_type];
  const parentCard = cards.find((candidate) => candidate.id === card.parent_id);
  const childCards = card.id ? cards.filter((candidate) => candidate.parent_id === card.id) : [];
  const dependencyIds = card.dependency_ids || [];
  const dependencyOptions = cards.filter((candidate) => candidate.id !== card.id);
  const dependencyIssues = cardDependencyIssues(card, cards);
  const parentOptions = cards.filter(
    (candidate) => candidate.id !== card.id && candidate.card_type === expectedParentType,
  );
  const deliverables = card.deliverables.length ? card.deliverables : [""];

  useEffect(() => {
    setPlannerDate(defaultPlannerDate);
    setPlannerAssignStatus("");
  }, [card.id, defaultPlannerDate]);

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
    setPlannerAssignStatus(result.message);
    setIsAssigningPlanner(false);
  }

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
                <option key={type} value={type}>
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
                <li key={`${issue.type}-${issue.dependency.id}`}>{issue.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="dependencies-editor">
          <header>
            <div>
              <GitBranch size={18} />
              <h3>Dependencies</h3>
            </div>
            <span>{dependencyIds.length} linked</span>
          </header>
          {dependencyOptions.length ? (
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
          )}
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

        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </div>
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
