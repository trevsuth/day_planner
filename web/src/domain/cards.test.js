import assert from "node:assert/strict";
import test from "node:test";

import {
  allCardIssues,
  cardCanChangeType,
  cardDependencyIssues,
  cardMatchesFilters,
  cardPayload,
  cardRelationshipLabel,
  dependencyDependentsFor,
  dependencyEdgesForCards,
  emptyCard,
  formatActivityValue,
  getHierarchyRows,
  getMonthCalendarDays,
  getScheduleBounds,
  getTimelinePoints,
  issueGroupsFromIssueRecords,
  projectIssuesForCards,
  summarizeCards,
  cardHierarchyDateIssues,
  ganttScheduleForCard,
  hierarchyShiftForCard,
} from "./cards.js";

import { defaultProjectFilters } from "./constants.js";
import { addDays, daysBetween, displayDate, formatDateInput, formatDateTime } from "./dates.js";

const projectId = "project-1";

function card(overrides) {
  return {
    id: overrides.id,
    project_id: projectId,
    card_type: overrides.card_type || "epic",
    title: overrides.title || overrides.id,
    status: overrides.status || "backlog",
    start_date: overrides.start_date || "",
    due_date: overrides.due_date || "",
    parent_id: overrides.parent_id || "",
    dependency_ids: overrides.dependency_ids || [],
    deliverables: [],
    description: "",
    comments: "",
  };
}

test("derives a missing parent Gantt schedule from descendants", () => {
  const epic = card({ id: "epic", title: "Launch" });
  const feature = card({
    id: "feature",
    card_type: "feature",
    title: "Build feature",
    parent_id: epic.id,
    start_date: "2030-06-05",
    due_date: "2030-06-12",
  });

  const schedule = ganttScheduleForCard(epic, [epic, feature]);

  assert.equal(schedule.start, "2030-06-05");
  assert.equal(schedule.end, "2030-06-12");
  assert.equal(schedule.startCard.id, feature.id);
  assert.equal(schedule.endCard.id, feature.id);
  assert.equal(schedule.isDerived, true);
});

test("reports hierarchy date conflicts against the descendant source card", () => {
  const epic = card({
    id: "epic",
    title: "Launch",
    start_date: "2030-06-08",
    due_date: "2030-06-10",
  });
  const feature = card({
    id: "feature",
    card_type: "feature",
    title: "Build feature",
    parent_id: epic.id,
    start_date: "2030-06-05",
    due_date: "2030-06-12",
  });

  const issues = cardHierarchyDateIssues(epic, [epic, feature]);

  assert.deepEqual(
    issues.map((issue) => [issue.boundary, issue.dependency.id]),
    [
      ["start", feature.id],
      ["end", feature.id],
    ],
  );
});

test("blocks hierarchy shifts that would move descendants below subtask", () => {
  const epic = card({ id: "epic", card_type: "epic" });
  const feature = card({ id: "feature", card_type: "feature", parent_id: epic.id });
  const story = card({ id: "story", card_type: "story", parent_id: feature.id });
  const subtask = card({ id: "subtask", card_type: "subtask", parent_id: story.id });

  const shift = hierarchyShiftForCard(epic, "feature", [epic, feature, story, subtask]);

  assert.equal(shift.isBlocked, true);
  assert.equal(shift.descendants.length, 3);
});

test("reports blocked and date-conflicting dependencies", () => {
  const dependency = card({
    id: "dependency",
    title: "Contract",
    status: "blocked",
    due_date: "2030-06-10",
  });
  const dependent = card({
    id: "dependent",
    title: "Implementation",
    start_date: "2030-06-08",
    dependency_ids: [dependency.id],
  });

  const issues = cardDependencyIssues(dependent, [dependency, dependent]);

  assert.deepEqual(
    issues.map((issue) => issue.type),
    ["blocked_dependency", "date_conflict"],
  );
});

test("builds card edits without losing fields and allows dates to be cleared", () => {
  const draft = emptyCard(projectId);
  assert.equal(draft.project_id, projectId);
  assert.equal(draft.status, "backlog");
  assert.deepEqual(draft.dependency_ids, []);

  const existing = { ...draft, title: "Release", start_date: "2030-02-01", due_date: "2030-02-03" };
  assert.deepEqual(cardPayload(existing, { due_date: null, status: "done" }), {
    card_type: "epic",
    title: "Release",
    status: "done",
    description: "",
    comments: "",
    start_date: "2030-02-01",
    due_date: null,
    parent_id: "",
    dependency_ids: [],
    deliverables: [""],
  });
  assert.equal(existing.due_date, "2030-02-03");
});

test("expands roadmap descendants and retains cards with a missing parent", () => {
  const epic = card({ id: "epic", title: "Launch" });
  const feature = card({ id: "feature", parent_id: epic.id, card_type: "feature", due_date: "2030-02-02" });
  const story = card({ id: "story", parent_id: feature.id, card_type: "story" });
  const orphan = card({ id: "orphan", parent_id: "unknown", due_date: "2030-02-01" });
  const cards = [epic, story, orphan, feature];

  const rows = (expanded) => getHierarchyRows(cards, new Set(expanded))
    .map(({ card, level, childrenCount }) => [card.id, level, childrenCount]);
  assert.deepEqual(rows([]), [["orphan", 0, 0], ["epic", 0, 1]]);
  assert.deepEqual(rows(["epic", "feature"]), [
    ["orphan", 0, 0], ["epic", 0, 1], ["feature", 1, 1], ["story", 2, 0],
  ]);
  assert.equal(cardRelationshipLabel(feature, cards), "Epic: Launch");
  assert.equal(cardRelationshipLabel(orphan, cards), "No parent");
  assert.equal(cardCanChangeType(feature, "epic", cards), false);
  assert.equal(cardCanChangeType(story, "subtask", cards), false);
  assert.equal(cardCanChangeType(story, "story", cards), true);
});

test("uses the same due-date boundaries for filters and portfolio counts", () => {
  const today = formatDateInput(new Date());
  const late = card({ id: "late", status: "blocked", due_date: addDays(today, -1) });
  const todayCard = card({ id: "today", due_date: today });
  const soon = card({ id: "soon", due_date: addDays(today, 14) });
  const later = card({ id: "later", due_date: addDays(today, 15) });
  const completed = card({ id: "completed", status: "done", due_date: today });
  const undated = { ...card({ id: "undated", card_type: "feature" }), deliverables: ["Recovery guide"] };
  const cards = [late, todayCard, soon, later, completed, undated];

  const matching = (filters) => cards
    .filter((item) => cardMatchesFilters(item, { ...defaultProjectFilters, ...filters }))
    .map(({ id }) => id);
  assert.deepEqual(matching({ schedule: "overdue" }), ["late"]);
  assert.deepEqual(matching({ schedule: "due_soon" }), ["today", "soon"]);
  assert.deepEqual(matching({ schedule: "undated", cardTypes: ["feature"], query: " RECOVERY " }), ["undated"]);
  assert.deepEqual(matching({ schedule: "blocked", statuses: ["backlog"] }), []);

  const summary = summarizeCards(cards);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.dueSoon, 2);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.nextDueDate, late.due_date);
  assert.equal(summary.completion, 17);
  assert.equal(summarizeCards([]).completion, 0);
});

test("orders timeline events and builds a calendar across month boundaries", () => {
  const undated = card({ id: "undated" });
  const launch = card({ id: "launch", start_date: "2030-02-28", due_date: "2030-03-03" });
  const prep = card({ id: "prep", due_date: "2030-02-28", title: "A prep" });
  assert.deepEqual(getScheduleBounds([undated, launch, prep]), { start: "2030-02-28", end: "2030-03-03" });
  assert.equal(daysBetween(...Object.values(getScheduleBounds([undated]))), 30);
  assert.deepEqual(getTimelinePoints([undated, launch, prep]).map(({ card, kind }) => [card.id, kind]), [
    ["prep", "Due"], ["launch", "Start"], ["launch", "Due"],
  ]);
  const grid = getMonthCalendarDays("2030-02-01");
  assert.equal(grid.length, 42);
  assert.equal(grid[0], "2030-01-27");
  assert.equal(grid.at(-1), "2030-03-09");
  assert.match(displayDate("2030-02-28"), /2030/);
  assert.equal(formatDateTime(""), "");
  assert.ok(formatDateTime("2030-02-28T16:00:00Z"));
});

test("groups linked-card issues and omits references to missing cards", () => {
  const dependency = card({ id: "dependency", title: "Contract", due_date: "2030-02-03" });
  const dependent = card({
    id: "dependent", due_date: "2030-02-01", dependency_ids: [dependency.id, "missing"],
  });
  const cards = [dependency, dependent];
  const issues = allCardIssues(dependent, cards);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Due .* before dependency "Contract"/);
  assert.deepEqual(dependencyDependentsFor(dependency.id, cards), [dependent]);
  assert.deepEqual(dependencyEdgesForCards(cards), [{ dependency, dependent, issues }]);
  assert.deepEqual(projectIssuesForCards(cards), [{ card: dependent, issues }]);
  assert.deepEqual(issueGroupsFromIssueRecords(cards, [
    { card_id: "missing", message: "Ignore this row" },
    { card_id: dependent.id, dependency_id: dependency.id, type: "date_conflict", message: "Conflict" },
  ]), [{
    card: dependent, issues: [{ dependency, type: "date_conflict", severity: "warning", boundary: "", message: "Conflict" }],
  }]);
});

test("formats activity for removed parents, status changes, and long comments", () => {
  const epic = card({ id: "epic", title: "Launch" });
  assert.equal(formatActivityValue("parent_id", null, [epic]), "None");
  assert.equal(formatActivityValue("parent_id", "epic", [epic]), "Epic: Launch");
  assert.equal(formatActivityValue("parent_id", "removed", [epic]), "removed");
  assert.equal(formatActivityValue("status", "in_progress", []), "In Progress");
  assert.equal(formatActivityValue("comments", "   ", []), "None");
  assert.equal(formatActivityValue("comments", "First\nsecond", []), "First second");
  assert.equal(formatActivityValue("comments", "x".repeat(81), []), "x".repeat(77) + "...");
});
