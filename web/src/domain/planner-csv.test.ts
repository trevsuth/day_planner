import assert from "node:assert/strict";
import test from "node:test";

import { compactEntry, normalizeEntry, plannerPriorityText } from "./planner.ts";
import {
  csvHeaderMap,
  csvValue,
  normalizeCardStatus,
  normalizeCardType,
  parseCsv,
  safeFilePart,
  splitCsvList,
} from "./csv.ts";

test("normalizes planner entries to fixed visible rows", () => {
  const entry = normalizeEntry(
    {
      priorities: ["Ship"],
      priority_card_ids: ["card-1"],
      tasks: [{ text: "Review", completed: true }],
    },
    "2030-01-02",
  );

  assert.equal(entry.entry_date, "2030-01-02");
  assert.deepEqual(entry.priorities, ["Ship", "", ""]);
  assert.deepEqual(entry.priority_card_ids, ["card-1", null, null]);
  assert.equal(entry.tasks.length, 5);
  assert.deepEqual(entry.tasks[0], { text: "Review", completed: true });
});

test("compacts planner entries without losing linked priority alignment", () => {
  const compacted = compactEntry({
    entry_date: "2030-01-02",
    priorities: ["Ship", "", "Call"],
    priority_card_ids: ["card-1", "ignored", null],
    tasks: [
      { text: " Review ", completed: false },
      { text: " ", completed: true },
    ],
    schedule: "",
    notes: "",
  });

  assert.deepEqual(compacted.priorities, ["Ship", "Call"]);
  assert.deepEqual(compacted.priority_card_ids, ["card-1", null]);
  assert.deepEqual(compacted.tasks, [{ text: "Review", completed: false }]);
});

test("builds planner priority text from project and card labels", () => {
  assert.equal(
    plannerPriorityText(
      {
        id: "card-1",
        project_id: "project-1",
        card_type: "feature",
        title: "Timeline",
        description: null,
        comments: null,
        status: "backlog",
        start_date: null,
        due_date: null,
        parent_id: null,
        dependency_ids: [],
        deliverables: [],
        created_at: "",
        updated_at: "",
      },
      {
        id: "project-1",
        name: "Launch",
        description: null,
        created_at: "",
        updated_at: "",
      },
    ),
    "Launch - Feature: Timeline",
  );
});

test("parses quoted CSV and maps headers", () => {
  const rows = parseCsv('Title,Deliverables\n"Ship, test","One; Two"\n');
  const headers = csvHeaderMap(rows[0]);

  assert.equal(csvValue(rows[1], headers, "Title"), "Ship, test");
  assert.deepEqual(splitCsvList(csvValue(rows[1], headers, "Deliverables")), ["One", "Two"]);
});

test("normalizes imported card values", () => {
  assert.equal(normalizeCardType("Feature"), "feature");
  assert.equal(normalizeCardStatus("In Progress"), "in_progress");
  assert.equal(safeFilePart("Project: Alpha / Beta"), "project-alpha-beta");
});
