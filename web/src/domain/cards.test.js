import assert from "node:assert/strict";
import test from "node:test";

import {
  cardDependencyIssues,
  cardHierarchyDateIssues,
  ganttScheduleForCard,
  hierarchyShiftForCard,
} from "./cards.js";

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
