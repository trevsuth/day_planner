import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Link2,
  ListChecks,
  NotebookPen,
  Save,
  Star,
  Unlink,
} from "lucide-react";
import { request } from "../api/client";
import { addDays, displayDate, formatDateInput } from "../domain/dates";
import { compactEntry, normalizeEntry } from "../domain/planner";
import { IconButton, Section, StatusLine } from "../shared/components";

export function PlannerApp({ onOpenLinkedCard }) {
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

  useEffect(() => {
    if (!isDirty) return undefined;
    function warnBeforeLeaving(event) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty]);

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
