import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  ListChecks,
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
    status: "backlog",
    due_date: "",
    parent_id: "",
    deliverables: [""],
  };
}

function cardRelationshipLabel(card, cards) {
  const parent = cards.find((candidate) => candidate.id === card.parent_id);
  if (!parent) return "No parent";
  return `${cardTypeLabels[parent.card_type]}: ${parent.title}`;
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
      </nav>

      {activeTab === "planner" ? <PlannerApp /> : <ProjectsApp />}
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
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [cards, setCards] = useState([]);
  const [draftProject, setDraftProject] = useState({ name: "", description: "" });
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [status, setStatus] = useState("Loading");
  const [error, setError] = useState("");
  const projectNameInputRef = useRef(null);

  const activeProject = projects.find((project) => project.id === activeProjectId);

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

      if (isTyping || !event.altKey) return;

      const key = event.key.toLowerCase();
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
      } else if (["1", "2", "3", "4"].includes(key)) {
        event.preventDefault();
        startNewCard("epic", STATUSES[Number(key) - 1]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeProject, activeProjectId, projects, selectedCard, selectedProject]);

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
      setActiveProjectId((current) => current || data[0]?.id || "");
      setStatus("Ready");
    } catch (err) {
      setError("Could not load projects.");
      setStatus("Offline");
    }
  }

  async function loadCards(projectId) {
    setError("");
    try {
      const data = await request(`/api/projmgmt/projects/${projectId}/cards`);
      setCards(data);
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
          status: parent?.status || "backlog",
          due_date: null,
          parent_id: parent?.id || null,
          deliverables: [],
        }),
      });

      setCards((current) => [...current, saved]);
      setError("");
      return saved;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  async function saveSelectedCard() {
    if (!selectedCard?.title.trim()) return;

    const payload = {
      card_type: selectedCard.card_type,
      title: selectedCard.title.trim(),
      description: selectedCard.description?.trim() || null,
      status: selectedCard.status,
      due_date: selectedCard.due_date || null,
      parent_id: selectedCard.parent_id || null,
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
      setSelectedCard(null);
      setError("");
    } catch (err) {
      setError(err.message);
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

        <section className="project-board">
          {STATUSES.map((statusValue) => (
            <div className="board-column" key={statusValue}>
              <header>
                <h2>{statusLabels[statusValue]}</h2>
                <IconButton label={`Add ${statusLabels[statusValue]} card`} onClick={() => startNewCard("epic", statusValue)}>
                  <Plus size={18} />
                </IconButton>
              </header>
              <div className="card-stack">
                {cards
                  .filter((card) => card.status === statusValue)
                  .map((card) => (
                    <button className="project-card" key={card.id} type="button" onClick={() => setSelectedCard(card)}>
                      <span className={`card-type ${card.card_type}`}>{cardTypeLabels[card.card_type]}</span>
                      <strong>{card.title}</strong>
                      {card.description ? <p>{card.description}</p> : null}
                      <span className="relationship-label">{cardRelationshipLabel(card, cards)}</span>
                      <footer>
                        {card.due_date ? <span>Due {card.due_date}</span> : <span>No due date</span>}
                        <span>{card.deliverables.length} deliverables</span>
                      </footer>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </section>
      </div>

      {selectedCard ? (
        <CardEditor
          card={selectedCard}
          cards={cards}
          onCancel={() => setSelectedCard(null)}
          onChange={setSelectedCard}
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

function CardEditor({ card, cards, onCancel, onChange, onCreateChild, onDelete, onSubmit }) {
  const expectedParentType = parentTypeByCardType[card.card_type];
  const childType = childTypeByCardType[card.card_type];
  const parentCard = cards.find((candidate) => candidate.id === card.parent_id);
  const childCards = card.id ? cards.filter((candidate) => candidate.parent_id === card.id) : [];
  const parentOptions = cards.filter(
    (candidate) => candidate.id !== card.id && candidate.card_type === expectedParentType,
  );
  const deliverables = card.deliverables.length ? card.deliverables : [""];

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
            <span>Due Date</span>
            <input value={card.due_date || ""} type="date" onChange={(event) => updateField("due_date", event.target.value)} />
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
