import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ListChecks,
  NotebookPen,
  Save,
  Star,
} from "lucide-react";
import "./styles.css";

const TASK_COUNT = 5;
const PRIORITY_COUNT = 3;

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
        const response = await fetch(`/api/entries/${entryDate}`);
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
      const response = await fetch(`/api/entries/${entryDate}`, {
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
    <main className="app-shell">
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

      <div className={`status-line ${error ? "status-error" : ""}`}>
        {error ? <AlertCircle size={16} /> : <Check size={16} />}
        <span>{error || statusLabel}</span>
      </div>

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
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PlannerApp />
  </React.StrictMode>,
);
