import { cardTypeLabels, PRIORITY_COUNT, TASK_COUNT } from "./constants.js";
import type { PlannerEntry, PlannerTask, Project, ProjectCard } from "./types";

type PartialPlannerEntry = Partial<PlannerEntry> & {
  tasks?: Partial<PlannerTask>[];
};

export function normalizeEntry(entry: PartialPlannerEntry, entryDate: string): PlannerEntry {
  const priorities = [...(entry.priorities ?? [])];
  const priorityCardIds = [...(entry.priority_card_ids ?? [])];
  const tasks = [...(entry.tasks ?? [])];

  while (priorities.length < PRIORITY_COUNT) priorities.push("");
  while (priorityCardIds.length < PRIORITY_COUNT) priorityCardIds.push(null);
  while (tasks.length < TASK_COUNT) tasks.push({ text: "", completed: false });

  return {
    entry_date: entry.entry_date ?? entryDate,
    priorities: priorities.slice(0, PRIORITY_COUNT),
    priority_card_ids: priorityCardIds.slice(0, PRIORITY_COUNT),
    tasks: tasks.slice(0, TASK_COUNT).map((task) => ({
      text: task.text ?? "",
      completed: Boolean(task.completed),
    })),
    schedule: entry.schedule ?? "",
    notes: entry.notes ?? "",
  };
}

export function compactEntry(entry: PlannerEntry): PlannerEntry {
  const nonEmptyPriorities = entry.priorities
    .map((item, index) => ({
      cardId: entry.priority_card_ids[index] || null,
      text: item.trim(),
    }))
    .filter((item) => item.text);
  return {
    entry_date: entry.entry_date,
    priorities: nonEmptyPriorities.map((item) => item.text),
    priority_card_ids: nonEmptyPriorities.map((item) => item.cardId),
    tasks: entry.tasks
      .map((task) => ({ text: task.text.trim(), completed: task.completed }))
      .filter((task) => task.text),
    schedule: entry.schedule,
    notes: entry.notes,
  };
}

export function plannerPriorityText(card: ProjectCard, project?: Project | null): string {
  const prefix = project?.name ? `${project.name} - ` : "";
  return `${prefix}${cardTypeLabels[card.card_type]}: ${card.title}`.trim();
}
