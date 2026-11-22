import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDirectory = path.resolve(__dirname, "../../docs/screenshots");

async function createCard(request, card) {
  const response = await request.post("/api/projmgmt/cards", { data: card });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function seedReadmeData(request) {
  const projectResponse = await request.post("/api/projmgmt/projects", {
    data: {
      name: "Orbital Launch Program",
      description: "Cross-functional project plan with linked delivery cards.",
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = await projectResponse.json();

  const epic = await createCard(request, {
    project_id: project.id,
    card_type: "epic",
    title: "Launch readiness",
    description: "Coordinate delivery work before the operations review.",
    status: "in_progress",
    start_date: "2031-02-01",
    due_date: "2031-02-28",
    dependency_ids: [],
    deliverables: ["Readiness plan", "Executive review"],
  });
  const feature = await createCard(request, {
    project_id: project.id,
    card_type: "feature",
    title: "Operations dashboard",
    description: "Track project health across active launch work.",
    status: "in_progress",
    start_date: "2031-02-05",
    due_date: "2031-02-18",
    parent_id: epic.id,
    dependency_ids: [],
    deliverables: ["Dashboard view", "Status summary"],
  });
  await createCard(request, {
    project_id: project.id,
    card_type: "story",
    title: "CSV readiness export",
    status: "done",
    start_date: "2031-02-06",
    due_date: "2031-02-09",
    parent_id: feature.id,
    dependency_ids: [],
    deliverables: ["Export file"],
  });
  await createCard(request, {
    project_id: project.id,
    card_type: "story",
    title: "Review capacity warnings",
    status: "blocked",
    start_date: "2031-02-12",
    due_date: "2031-02-15",
    parent_id: feature.id,
    dependency_ids: [],
    deliverables: ["Warning copy"],
  });
  await createCard(request, {
    project_id: project.id,
    card_type: "feature",
    title: "Field handoff checklist",
    status: "backlog",
    start_date: "2031-02-16",
    due_date: "2031-02-24",
    parent_id: epic.id,
    dependency_ids: [feature.id],
    deliverables: ["Checklist", "Owner signoff"],
  });

  const assignmentResponse = await request.put(`/api/planner/card-assignments/${feature.id}`, {
    data: {
      entry_date: "2031-02-05",
      priority_text: "Orbital Launch Program - Feature: Operations dashboard",
    },
  });
  expect(assignmentResponse.ok()).toBeTruthy();

  const plannerResponse = await request.put("/api/planner/entries/2031-02-05", {
    data: {
      entry_date: "2031-02-05",
      priorities: [
        "Orbital Launch Program - Feature: Operations dashboard",
        "Confirm launch review agenda",
        "Prepare handoff notes",
      ],
      priority_card_ids: [feature.id, null, null],
      tasks: [
        { text: "Review blocked work", completed: false },
        { text: "Send readiness notes", completed: true },
        { text: "Update project Gantt", completed: false },
      ],
      schedule: "09:00 Planning block\n11:00 Team sync\n14:00 Review risks",
      notes: "Use the project card link for details before the afternoon review.",
    },
  });
  expect(plannerResponse.ok()).toBeTruthy();

  return { epic, feature, project };
}

async function openProjects(page) {
  await page
    .getByRole("navigation", { name: "Application views" })
    .getByRole("link", { name: "Projects" })
    .click();
  await expect(page.getByText("Project Management")).toBeVisible();
}

test("capture README screenshots", async ({ page, request }) => {
  await fs.mkdir(screenshotDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { feature } = await seedReadmeData(request);

  await page.goto("/");
  await page.getByLabel("Planner date").fill("2031-02-05");
  await expect(page.locator(".priority-row input").first()).toHaveValue(/Operations dashboard/);
  await page.screenshot({ path: path.join(screenshotDirectory, "planner.png"), fullPage: true });

  await openProjects(page);
  await page
    .getByRole("navigation", { name: "Project management views" })
    .getByRole("button", { name: "Board" })
    .click();
  await expect(page.getByRole("button", { name: /^Select Operations dashboard/ })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDirectory, "project-board.png"), fullPage: true });

  await page
    .getByRole("navigation", { name: "Project management views" })
    .getByRole("button", { name: "Gantt" })
    .click();
  await expect(page.locator(".gantt-row", { hasText: "Launch readiness" })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDirectory, "gantt.png"), fullPage: true });

  await page
    .getByRole("navigation", { name: "Project management views" })
    .getByRole("button", { name: "Board" })
    .click();
  await page.getByRole("button", { name: /^Select Operations dashboard/ }).click();
  await page
    .getByRole("complementary", { name: "Selected card preview" })
    .getByRole("button", { name: "Edit" })
    .click();
  await expect(page.getByRole("heading", { name: "Edit Card" })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDirectory, "card-editor.png"), fullPage: true });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Edit Card" })).toBeHidden();
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDirectory, "shortcuts.png"), fullPage: true });
});

test("capture Graph screenshots", async ({ page }) => {
  await fs.mkdir(screenshotDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const timestamp = "2031-02-05T12:00:00Z";
  const nodes = [
    { id: "plan", title: "Launch plan", x: 690, y: 435, label: "Operations", fill: "#371542", stroke: "#ff74d4" },
    { id: "weather", title: "Weather brief", x: 330, y: 240, label: "Forecast", fill: "#0a3043", stroke: "#50dfff" },
    { id: "telemetry", title: "Telemetry", x: 1040, y: 225, label: "Systems", fill: "#123730", stroke: "#73efba" },
    { id: "checklist", title: "Pad checklist", x: 320, y: 635, label: "Checklist", fill: "#352714", stroke: "#fbd274" },
    { id: "handoff", title: "Crew handoff", x: 1050, y: 650, label: "People", fill: "#24264a", stroke: "#9aa7ff" },
  ].map(({ id, title, x, y, label, fill, stroke }) => ({
    id, title, x, y,
    labels: [label],
    tags: ["launch"],
    attachments: [],
    content: {
      type: "article",
      markdown: id === "plan"
        ? "## Readiness review\nConfirm the launch window with the [[Weather brief]].\n\n- Verify the [[Pad checklist]].\n- Review [[Telemetry]] before the [[Crew handoff]]."
        : `Notes for ${title.toLowerCase()}. See the [[Launch plan]].`,
      updatedAt: timestamp,
    },
    style: { radius: id === "plan" ? 72 : 62, fill, stroke, textColor: "#e5fbff" },
  }));
  const relationships = [
    ["plan", "weather", "depends on"],
    ["plan", "telemetry", "monitors"],
    ["plan", "checklist", "requires"],
    ["plan", "handoff", "coordinates"],
    ["telemetry", "handoff", "informs"],
  ].map(([fromNodeId, toNodeId, type]) => ({
    id: `${fromNodeId}-${toNodeId}`,
    fromNodeId, toNodeId, type,
    properties: {},
    style: { stroke: "#4acae0", width: 2 },
  }));
  const document = {
    schemaVersion: 1,
    id: "launch-knowledge-map",
    title: "Launch knowledge map",
    nodes,
    relationships,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await page.goto("/graph/");
  await page.locator(".document-actions summary").click();
  await page.getByLabel("Import JSON").setInputFiles({
    name: "launch-knowledge-map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  const graphNodes = page.locator(".graph-node");
  await expect(graphNodes).toHaveCount(nodes.length);
  await expect(page.locator(".save-status")).toHaveClass(/\bsaved\b/);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.screenshot({ path: path.join(screenshotDirectory, "graph-canvas.png"), fullPage: true });

  await graphNodes.filter({ hasText: "Launch plan" }).locator("circle").first().click();
  await expect(page.getByRole("heading", { name: "Readiness review" })).toBeVisible();
  await page.locator(".markdown-preview").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshotDirectory, "graph-wiki.png"), fullPage: true });
});

test("capture Viewer screenshot", async ({ page }) => {
  await fs.mkdir(screenshotDirectory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/viewer/");
  await expect(page.getByLabel("Diagram type")).toHaveValue("flowchart");
  await page.waitForFunction(() => document.querySelector(".diagram img")?.naturalWidth > 0);
  await page.screenshot({ path: path.join(screenshotDirectory, "viewer.png"), fullPage: true });
});
