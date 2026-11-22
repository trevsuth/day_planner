import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("opens the Viewer and renders Markdown, Mermaid files, and diagram errors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Application views" }).getByRole("link", { name: "Viewer" }).click();
  await expect(page).toHaveURL(/\/viewer\/$/);
  const source = page.getByLabel("Source", { exact: true });
  const preview = page.getByRole("region", { name: "Preview" });
  await source.fill("# Release notes\n\n```mermaid\nflowchart LR\n  Draft --> Review\n```\n\n<strong>Raw HTML</strong>");
  await expect(preview.getByRole("heading", { name: "Release notes" })).toBeVisible();
  await expect(preview.getByText("<strong>Raw HTML</strong>")).toBeVisible();
  const diagram = preview.getByRole("img", { name: "Mermaid diagram" });
  await expect(diagram).toBeVisible();
  await expect.poll(() => diagram.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);

  await page.getByLabel("Open file").setInputFiles({
    name: "workflow.mmd",
    mimeType: "text/plain",
    buffer: Buffer.from("sequenceDiagram\n  Alice->>Bob: Review"),
  });
  await expect(page.getByLabel("Format")).toHaveValue("mermaid");
  await expect(diagram).toBeVisible();
  await expect.poll(() => diagram.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await source.fill("invalid diagram syntax");
  await expect(preview.getByRole("alert")).toContainText("Could not render diagram");
});

test("shares Graph and its files across browsers and restores a portable backup", async ({ page, browser }) => {
  await page.goto("/graph/");
  await page.locator(".document-actions summary").click();
  await page.getByRole("button", { name: "New document" }).click();
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByText("Attached files", { exact: true }).click();
  const contents = Buffer.from([0, 17, 128, 255]);
  await page.getByLabel("Add metadata").setInputFiles({
    name: "sample.bin",
    mimeType: "application/octet-stream",
    buffer: contents,
  });
  await expect(page.getByText("sample.bin", { exact: true })).toBeVisible();
  await expect(page.locator(".save-status")).toHaveClass(/\bsaved\b/);

  const backupEvent = page.waitForEvent("download");
  await page.locator(".document-actions summary").click();
  await page.getByRole("button", { name: "Export backup" }).click();
  await page.keyboard.press("Escape");
  const backup = await backupEvent;

  const freshPage = await browser.newPage();
  try {
    await freshPage.goto(page.url());
    const node = freshPage.locator(".graph-node");
    await expect(node).toHaveCount(1);
    await node.click();
    await freshPage.getByText("Attached files", { exact: true }).click();
    const originalAttachment = freshPage.waitForEvent("download");
    await freshPage.getByRole("button", { name: "Download", exact: true }).click();
    expect(await readFile(await (await originalAttachment).path())).toEqual(contents);

    await freshPage.locator(".document-actions summary").click();
    await freshPage.getByRole("button", { name: "New document" }).click();
    await expect(node).toHaveCount(0);
    await expect(freshPage.locator(".save-status")).toHaveClass(/\bsaved\b/);
    await freshPage.locator(".document-actions summary").click();
    await freshPage.getByLabel("Import JSON").setInputFiles({
      name: backup.suggestedFilename(),
      mimeType: "application/json",
      buffer: await readFile(await backup.path()),
    });
    await expect(node).toBeVisible();
    await expect(freshPage.locator(".save-status")).toHaveClass(/\bsaved\b/);
    await freshPage.reload();
    await node.click();
    await freshPage.getByText("Attached files", { exact: true }).click();

    const attachmentEvent = freshPage.waitForEvent("download");
    await freshPage.getByRole("button", { name: "Download", exact: true }).click();
    expect(await readFile(await (await attachmentEvent).path())).toEqual(contents);

    await page.locator(".document-actions summary").click();
    await page.getByRole("textbox", { name: "Graph title" }).fill("Stale edit");
    await expect(page.getByRole("alert")).toContainText("The graph changed in another browser");
    await expect(page.getByRole("alert")).toContainText(/Request ID: [a-zA-Z0-9_-]+/);
    await freshPage.reload();
    await expect(freshPage.getByRole("heading", { level: 1 })).toHaveText("Local Graph Wiki");
  } finally {
    await freshPage.context().close();
  }
});

test("keeps Graph document actions and the inspector reachable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto("/graph/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Graph summary" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search Graph" })).toBeVisible();
  const actions = page.locator(".document-actions summary");
  await actions.click();
  const backup = page.getByRole("button", { name: "Export backup" });
  await expect(backup).toBeInViewport();
  await backup.focus();
  await page.keyboard.press("Escape");
  await expect(backup).toBeHidden();
  await expect(actions).toBeFocused();
  await page.getByRole("button", { name: "Add node" }).click();
  const title = page.getByLabel("Title", { exact: true });
  await title.scrollIntoViewIfNeeded();
  await expect(title).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator(".save-status")).toHaveClass(/\bsaved\b/);
});

async function openProjects(page) {
  await page
    .getByRole("navigation", { name: "Application views" })
    .getByRole("link", { name: "Projects" })
    .click();
  await expect(page.getByText("Project Management")).toBeVisible();
}

async function createProject(page, name) {
  await page
    .locator(".project-toolbar")
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  const drawer = page.getByRole("region", {
    name: "Project selection and creation",
  });
  await drawer.getByPlaceholder("New project").fill(name);
  const projectResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/projmgmt/projects") &&
      response.request().method() === "POST",
  );
  await drawer.getByRole("button", { name: "Project", exact: true }).click();
  return (await projectResponse).json();
}

async function createCard(request, card) {
  const response = await request.post("/api/projmgmt/cards", { data: card });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("loads the planner, project manager, and API reference", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Daily Planner")).toBeVisible();

  await openProjects(page);
  await expect(page.getByRole("button", { name: "Gantt" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Application views" })
    .getByRole("link", { name: "API" })
    .click();
  await expect(page.getByRole("heading", { name: "Local API" })).toBeVisible();

  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await expect(page.getByText("Web Projects")).toBeVisible();
  await page.getByLabel("Close shortcuts").click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();
});

test("navigates between tools and restores Projects from its URL", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Application views" });
  await openProjects(page);
  await expect(page).toHaveURL(/\?view=projects$/);
  await page.reload();
  await expect(navigation.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("link", { name: "Graph" }).click();
  await expect(page).toHaveURL(/\/graph\/$/);
  await expect(navigation.getByRole("link", { name: "Graph" })).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("link", { name: "Planner" }).click();
  await expect(page.getByText("Daily Planner")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/graph\/$/);
  await navigation.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByText("Project Management")).toBeVisible();
});

test("edits Gantt dates and surfaces derived schedule conflicts", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await openProjects(page);
  const project = await createProject(page, "Roadmap smoke project");

  const epic = await createCard(request, {
    project_id: project.id,
    card_type: "epic",
    title: "Launch program",
    status: "backlog",
    dependency_ids: [],
    deliverables: [],
  });
  await createCard(request, {
    project_id: project.id,
    card_type: "feature",
    title: "Delivery feature",
    status: "backlog",
    start_date: "2030-06-05",
    due_date: "2030-06-12",
    parent_id: epic.id,
    dependency_ids: [],
    deliverables: [],
  });

  await page.reload();
  await openProjects(page);
  await page
    .getByRole("navigation", { name: "Project management views" })
    .getByRole("button", { name: "Gantt" })
    .click();

  const epicRow = page.locator(".gantt-row", { hasText: "Launch program" });
  await expect(epicRow.getByText("Derived dates")).toBeVisible();
  await epicRow.locator(".gantt-card-open").click();

  const summary = page.getByRole("complementary", {
    name: "Selected card preview",
  });
  await expect(
    summary.getByText(
      "Shown on chart as 2030-06-05 to 2030-06-12 using descendant dates.",
    ),
  ).toBeVisible();
  await expect(summary.getByRole("button", { name: "Start from Delivery feature" })).toBeVisible();
  await expect(summary.getByRole("button", { name: "End from Delivery feature" })).toBeVisible();

  await summary.getByLabel("Start Date").fill("2030-06-08");
  await summary.getByLabel("End Date").fill("2030-06-10");
  await summary.getByRole("button", { name: "Save Dates" }).click();
  await expect(summary.getByText("Saved")).toBeVisible();

  await summary.getByLabel("Close preview").click();
  await page
    .getByRole("navigation", { name: "Project management views" })
    .getByRole("button", { name: "Issues" })
    .click();
  await expect(page.getByText("Hierarchy Date Conflicts")).toBeVisible();
  await expect(
    page.getByText(
      '"Delivery feature" begins 2030-06-05 before this card starts 2030-06-08.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      '"Delivery feature" ends 2030-06-12 after this card is due 2030-06-10.',
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Delivery feature.*begins 2030-06-05/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Selected card preview" }).getByRole("heading", { name: "Delivery feature" }),
  ).toBeVisible();
});

test("assigns a project card to a future planner priority", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await openProjects(page);
  const project = await createProject(page, "Planner assignment project");
  const card = await createCard(request, {
    project_id: project.id,
    card_type: "epic",
    title: "Future review",
    status: "backlog",
    dependency_ids: [],
    deliverables: [],
  });
  const fullDay = await request.put("/api/planner/entries/2031-01-17", {
    data: {
      entry_date: "2031-01-17",
      priorities: ["One", "Two", "Three"],
      priority_card_ids: [null, null, null],
      tasks: [],
      schedule: "",
      notes: "",
    },
  });
  expect(fullDay.ok()).toBeTruthy();

  await page.reload();
  await openProjects(page);
  await page
    .getByRole("navigation", { name: "Project management views" })
    .getByRole("button", { name: "Board" })
    .click();
  await page.locator(".project-card", { hasText: "Future review" }).click();
  await page
    .getByRole("complementary", { name: "Selected card preview" })
    .getByRole("button", { name: "Edit" })
    .click();

  const assignment = page.locator(".planner-assignment-panel");
  await assignment.getByLabel("Date").fill("2031-01-17");
  await expect(assignment.getByText("3 of 3 priority slots used")).toBeVisible();
  await expect(assignment.getByText("2031-01-17 is full.")).toBeVisible();
  await assignment.getByLabel("Date").fill("2031-01-15");
  await expect(assignment.getByText("0 of 3 priority slots used")).toBeVisible();
  await assignment.getByRole("button", { name: "Assign" }).click();
  await expect(
    assignment.getByText("Assigned to 2031-01-15 priority 1."),
  ).toBeVisible();
  await expect(assignment.getByText("1 of 3 priority slots used")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Edit Card" })).toBeHidden();
  await page
    .getByRole("navigation", { name: "Application views" })
    .getByRole("link", { name: "Planner" })
    .click();
  await page.getByLabel("Planner date").fill("2031-01-15");
  await expect(page.locator(".priority-row input").first()).toHaveValue(
    /Future review/,
  );
  await expect(page.getByRole("button", { name: "Card", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Card", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Selected card preview" }).getByRole("heading", { name: "Future review" }),
  ).toBeVisible();

  const rescheduled = await request.put(`/api/planner/card-assignments/${card.id}`, {
    data: {
      entry_date: "2031-01-16",
      priority_text: "Planner assignment project - Epic: Future review",
    },
  });
  expect(rescheduled.ok()).toBeTruthy();
  const formerDay = await (await request.get("/api/planner/entries/2031-01-15")).json();
  expect(formerDay.priority_card_ids).toEqual([]);

  await page
    .getByRole("navigation", { name: "Application views" })
    .getByRole("link", { name: "Planner" })
    .click();
  await page.getByLabel("Planner date").fill("2031-01-16");
  await expect(page.getByRole("button", { name: "Card", exact: true })).toBeVisible();
  await page.getByLabel("Remove card assignment").click();
  await expect(page.locator(".priority-row input").first()).toHaveValue("");
});
