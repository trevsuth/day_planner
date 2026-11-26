import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("opens the Viewer and renders Markdown, Mermaid files, and diagram errors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Application views" }).getByRole("link", { name: "Viewer" }).click();
  await expect(page).toHaveURL(/\/viewer\/$/);
  const source = page.getByLabel("Source", { exact: true });
  const preview = page.getByRole("region", { name: "Preview", exact: true });
  const format = page.getByLabel("Format");
  const diagramType = page.getByLabel("Diagram type");
  const diagram = preview.getByRole("img", { name: "Mermaid diagram" });
  await expect(format).toHaveValue("mermaid");
  await expect(diagramType).toHaveValue("flowchart");
  await expect(source).toHaveValue(/^flowchart LR/);
  await expect(diagram).toBeVisible();
  await expect.poll(() => diagram.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);

  for (const type of ["sequence", "class", "state", "er", "gantt", "pie", "mindmap", "timeline", "git"]) {
    const previousImage = await diagram.getAttribute("src");
    await diagramType.selectOption(type);
    await expect(diagram).not.toHaveAttribute("src", previousImage);
    await expect.poll(() => diagram.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  }
  await diagramType.selectOption("sequence");
  const editedSequence = "sequenceDiagram\n  Alice->>Bob: Draft edit";
  await source.fill(editedSequence);
  const splitWidth = (await preview.boundingBox()).width;
  await preview.getByRole("button", { name: "Expand preview" }).click();
  await expect(source).toBeHidden();
  await expect.poll(async () => (await preview.boundingBox()).width).toBeGreaterThan(splitWidth * 1.8);
  await expect(page.getByRole("navigation", { name: "Application views" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Restore split view" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(source).toBeVisible();
  await expect(source).toHaveValue(editedSequence);
  await expect(preview.getByRole("button", { name: "Expand preview" })).toBeFocused();
  const canvas = preview.getByRole("region", { name: "Preview canvas" });
  await preview.getByRole("button", { name: "Zoom in" }).click();
  await preview.getByRole("button", { name: "Zoom in" }).click();
  await expect(preview.getByLabel("Preview zoom")).toHaveText("156%");
  const pan = preview.getByRole("button", { name: "Pan preview" });
  await pan.click();
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  const area = await canvas.boundingBox();
  const beforePan = await canvas.evaluate((element) => element.scrollLeft);
  await page.mouse.move(area.x + area.width / 2, area.y + 100);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 - 75, area.y + 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => canvas.evaluate((element) => element.scrollLeft)).toBeGreaterThan(beforePan);
  await pan.click();
  await preview.getByRole("button", { name: "Fit" }).click();
  await expect(preview.getByLabel("Preview zoom")).toHaveText("100%");
  await expect.poll(() => canvas.evaluate((element) => element.scrollLeft)).toBe(0);
  await diagramType.selectOption("flowchart");
  await expect(source).toHaveValue(/^flowchart LR/);
  await diagramType.selectOption("sequence");
  await expect(source).toHaveValue(editedSequence);

  await format.selectOption("markdown");
  await expect(diagramType).toBeHidden();
  await source.fill("# Release notes\n\n```mermaid\nflowchart LR\n  Draft --> Review\n```\n\n<strong>Raw HTML</strong>");
  await expect(preview.getByRole("heading", { name: "Release notes" })).toBeVisible();
  await expect(preview.getByText("<strong>Raw HTML</strong>")).toBeVisible();
  await expect(diagram).toBeVisible();
  await expect.poll(() => diagram.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);

  await page.getByLabel("Open file").setInputFiles({
    name: "workflow.mmd",
    mimeType: "text/plain",
    buffer: Buffer.from("sequenceDiagram\n  Alice->>Bob: Review"),
  });
  await expect(page.getByLabel("Format")).toHaveValue("mermaid");
  await expect(diagramType).toHaveValue("file");
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
  await expect(page.getByRole("heading", { name: "Day Planner API" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Graph", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Viewer", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Docs" })).toHaveAttribute("href", "/docs");

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

test("validates files, previews invisible-character removal, and highlights both regex dialects", async ({ page }) => {
  await page.goto("/?view=validation");
  const tool = () => page.locator(".validation-tool:visible");
  const source = () => tool().getByLabel("Source text");

  await source().fill('{\n  "x":\n}');
  await tool().getByRole("button", { name: "Validate", exact: true }).click();
  await expect(tool().getByRole("alert")).toContainText("Line 3, column 1");
  await tool().getByLabel("Open UTF-8 text file").setInputFiles({
    name: "test.toml", mimeType: "text/plain", buffer: Buffer.from("port=123 # keep\n"),
  });
  await expect(tool().getByLabel("Format", { exact: true })).toHaveValue("toml");
  await tool().getByRole("button", { name: "Format document" }).click();
  await expect(tool().getByLabel("Formatted output")).toHaveValue("port = 123 # keep\n");

  await page.getByRole("button", { name: "Invisible Characters", exact: true }).click();
  await source().fill("hello\u200b world");
  await tool().getByRole("button", { name: "Show invisible characters" }).click();
  await expect(tool().getByText("U+200B", { exact: true })).toBeVisible();
  await tool().getByRole("checkbox").check();
  await tool().getByRole("button", { name: "Preview removal" }).click();
  await expect(tool().getByLabel("Cleaned preview")).toHaveValue("hello world");
  await expect(source()).toHaveValue("hello\u200b world");

  await page.getByRole("button", { name: "Regex Playground", exact: true }).click();
  await expect(tool().getByLabel("Regex dialect")).toHaveValue("python");
  await source().fill("🙂 dog cat DOG");
  await tool().getByLabel("Pattern").fill("(?P<pet>dog)");
  await tool().getByLabel("Flags").fill("i");
  await tool().getByRole("button", { name: "Find matches" }).click();
  await expect(tool().locator("mark")).toHaveText(["dog", "DOG"]);

  await tool().getByLabel("Regex dialect").selectOption("javascript");
  await tool().getByLabel("Pattern").fill("(?<pet>cat)");
  await tool().getByRole("button", { name: "Find matches" }).click();
  await expect(tool().locator("mark")).toHaveText(["cat"]);
});

test("shows the same module selector in every hosted view", async ({ page }) => {
  const views = new Map([
    ["Planner", "/"],
    ["Projects", "/?view=projects"],
    ["Graph", "/graph/"],
    ["Viewer", "/viewer/"],
    ["Validation", "/?view=validation"],
    ["Calculator", "/?view=calculator"],
    ["Search", "/?view=search"],
    ["API", "/?view=api"],
  ]);
  const navigation = page.getByRole("navigation", { name: "Application views" });

  for (const [current, url] of views) {
    await page.goto(url);
    for (const [label, href] of views) {
      await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    }
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(current);
    await expect(navigation.getByLabel("Keyboard shortcuts")).toBeVisible();
  }

  for (const url of ["/graph/", "/viewer/"]) {
    await page.goto(url);
    const popupPromise = page.waitForEvent("popup");
    await navigation.getByRole("link", { name: "Keyboard shortcuts" }).click();
    const popup = await popupPromise;
    await expect(popup.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await popup.close();
    await expect(page).toHaveURL((location) => location.pathname === url);
  }
});

test("translates Snowflake SQL to BigQuery and checks JSON Schema paths", async ({ page }) => {
  await page.goto("/?view=validation");
  const tool = page.locator(".validation-tool:visible");
  await page.getByRole("button", { name: "SQL Translate & Format" }).click();
  await tool.getByLabel("Source dialect").selectOption("snowflake");
  await tool.getByLabel("Target dialect").selectOption("bigquery");
  await tool.getByLabel("Source text").fill("SELECT DATEADD(day, 1, TO_DATE('2025-01-01'))");
  await tool.getByRole("button", { name: "Translate SQL" }).click();
  await expect(tool.getByLabel("SQL output")).toHaveValue(/DATE_ADD.*INTERVAL 1 DAY/);

  await page.getByRole("button", { name: "JSON Schema", exact: true }).click();
  await tool.getByLabel("Source text").fill('{"items":[{"dueDate":4}]}');
  await tool.getByLabel("JSON Schema (Draft 2020-12)").fill(
    '{"properties":{"items":{"items":{"properties":{"dueDate":{"type":"string"}}}}}}',
  );
  await tool.getByRole("button", { name: "Check against schema" }).click();
  await expect(tool.getByText("$.items[0].dueDate", { exact: true })).toBeVisible();
  await expect(tool.getByRole("alert")).toContainText("4 is not of type 'string'");
});

test("downloads a rendered Mermaid diagram as SVG and PNG", async ({ page }) => {
  await page.goto("/viewer/");
  const controls = page.getByRole("group", { name: "Export diagram 1" });
  for (const [format, signature] of [["SVG", "<svg"], ["PNG", "\x89PNG\r\n\x1a\n"]]) {
    const downloaded = page.waitForEvent("download");
    await controls.getByRole("button", { name: `Download ${format}` }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(`diagram-1.${format.toLowerCase()}`);
    const bytes = await readFile(await download.path());
    expect(bytes.includes(Buffer.from(signature, "latin1"))).toBeTruthy();
  }
});

test("validates XML with an XSD and reports the element path", async ({ page }) => {
  await page.goto("/?view=validation");
  const tool = page.locator(".validation-tool:visible");
  await page.getByRole("button", { name: "XML Schema", exact: true }).click();
  await tool.getByLabel("XML Schema (XSD 1.0)").fill(
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">' +
    '<xs:element name="count" type="xs:integer"/></xs:schema>',
  );
  await tool.getByLabel("Source text").fill("<count>seven</count>");
  await tool.getByRole("button", { name: "Check against schema" }).click();
  await expect(tool.getByText("/count", { exact: true })).toBeVisible();
  await expect(tool.getByRole("alert")).toContainText("Line 1");
  await tool.getByLabel("Source text").fill("<count>7</count>");
  await tool.getByRole("button", { name: "Check against schema" }).click();
  await expect(tool.getByRole("status")).toHaveText("XML satisfies the schema.");
});

test("search opens the matching Planner day, project card, and Graph runbook", async ({ page, request }) => {
  const phrase = "Beacon recovery";
  const date = "2032-02-10";
  expect((await request.put(`/api/planner/entries/${date}`, { data: { entry_date: date, notes: phrase } })).ok()).toBeTruthy();
  const project = await (await request.post("/api/projmgmt/projects", { data: { name: "Beacon lab" } })).json();
  const card = await createCard(request, { title: phrase, project_id: project.id, card_type: "epic" });
  const workspace = await (await request.get("/api/graphs/workspace")).json();
  const timestamp = "2032-02-10T12:00:00Z";
  const node = {
    id: "beacon-runbook", title: "Beacon recovery runbook", x: 350, y: 260,
    labels: [], tags: [], attachments: [],
    content: { type: "note", markdown: "## Restore the beacon", updatedAt: timestamp },
    style: { radius: 45, fill: "#123730", stroke: "#73efba", textColor: "#e5fbff" },
  };
  expect((await request.put("/api/graphs/workspace", { data: {
    revision: workspace.revision,
    document: {
      schemaVersion: 1, id: "beacon-doc", title: "Lab", createdAt: timestamp, updatedAt: timestamp,
      relationships: [], nodes: [node],
    },
  } })).ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByLabel("Planner date")).toBeVisible();
  await page.keyboard.press("Control+Shift+K");
  await page.getByRole("searchbox").fill(phrase);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const planner = page.getByRole("link", { name: date, exact: true });
  await expect(planner).toBeVisible();
  const cardLink = page.getByRole("link", { name: phrase, exact: true });
  const noteLink = page.getByRole("link", { name: node.title });
  const cardUrl = await cardLink.getAttribute("href");
  const noteUrl = await noteLink.getAttribute("href");
  await planner.click();
  await expect(page.getByLabel("Planner date")).toHaveValue(date);
  await page.goto(noteUrl);
  await expect(page.getByRole("heading", { name: "Restore the beacon" })).toBeVisible();

  await page.goto(cardUrl);
  const preview = page.getByRole("complementary", { name: "Selected card preview" });
  await expect(preview.getByRole("heading", { name: phrase })).toBeVisible();
  await preview.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Choose a Graph note" }).click();
  await page.getByLabel("Linked Graph note").selectOption(node.id);
  const savedResponse = page.waitForResponse((response) =>
    response.request().method() === "PUT" && response.url().endsWith(`/api/projmgmt/cards/${card.id}`),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await (await savedResponse).json();
  expect(saved.graph_node_id).toBe(node.id);
  await page.goto(cardUrl);
  await expect(preview.getByRole("link", { name: "Open Graph runbook" })).toHaveAttribute("href", noteUrl);

  await page.getByLabel("Primary project actions").getByRole("button", { name: "Card", exact: true }).click();
  await page.getByLabel("Card template").selectOption("service-upgrade");
  await page.getByRole("button", { name: "Apply template" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Service upgrade");
  await expect(page.locator('input[value="Verify backup"]')).toBeVisible();
});

test("compares formatted configs and exports a printable offline Viewer document", async ({ page }) => {
  await page.goto("/?view=validation");
  await page.getByRole("button", { name: "Config Diff" }).click();
  await page.getByLabel("Before", { exact: true }).fill('{"port":80}');
  await page.getByLabel("After", { exact: true }).fill('{"port" : 443}');
  await page.getByRole("button", { name: "Compare configs" }).click();
  const comparison = page.getByRole("table", { name: "Formatted comparison" });
  await expect(comparison.locator(".diff-replace")).toContainText('"port": 443');

  await page.goto("/viewer/");
  await page.getByLabel("Format").selectOption("markdown");
  await page.getByLabel("Source").fill("# Lab runbook\n\n```mermaid\nflowchart LR\nA-->B\n```");
  await expect(page.locator("#preview .diagram img")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("viewer-export.html");
  const html = await readFile(await file.path(), "utf8");
  expect(html).toContain("<h1>Lab runbook</h1>");
  expect(html).toContain("data:image/svg+xml;base64,");
  expect(html).not.toContain("blob:");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Application views" })).toBeHidden();
  await expect(page.locator("#source-pane")).toBeHidden();
  await expect(page.locator("#preview").getByRole("heading", { name: "Lab runbook" })).toBeVisible();
});

test("downloads and imports the linked user guide graph", async ({ page, request }) => {
  await page.goto("/graph/");
  const before = await (await request.get("/api/graphs/workspace")).json();
  const downloadEvent = page.waitForEvent("download");
  await page.locator(".document-actions summary").click();
  await page.getByRole("link", { name: "Download user guide" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("user-guide.graph.json");
  const bytes = await readFile(await download.path());
  const guide = JSON.parse(bytes.toString());
  expect(guide.title).toBe("Day Planner User Guide");
  expect((await (await request.get("/api/graphs/workspace")).json()).revision).toBe(before.revision);

  await page.locator(".document-actions summary").click();
  await page.getByLabel("Import JSON").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.getByRole("heading", { name: "Day Planner User Guide" })).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(guide.nodes.length);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.locator(".graph-node").filter({ hasText: "Start Here" }).locator("circle").first().click();
  const note = page.locator(".markdown-preview");
  await expect(note.getByRole("heading", { name: /Day Planner user.s guide/ })).toBeVisible();
  await note.getByRole("link", { name: "Quickstart", exact: true }).click();
  await expect(note.getByRole("heading", { name: "Run the suite locally" })).toBeVisible();
});

test("uses the Calculator for bases, Base64, and IP subnets", async ({ page }) => {
  await page.goto("/?view=calculator");
  const tool = () => page.locator(".validation-tool:visible");
  await tool().getByLabel("Integer", { exact: true }).fill("0xFF");
  await tool().getByLabel("Input base").selectOption("16");
  await tool().getByRole("button", { name: "Convert bases" }).click();
  await expect(tool().getByText("11111111", { exact: true })).toBeVisible();
  await expect(tool().getByText("255", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Base64", exact: true }).click();
  await tool().getByLabel("Base64 tool input").fill("Lab");
  await tool().getByRole("button", { name: "Convert Base64" }).click();
  await expect(tool().getByLabel("Base64 tool output")).toHaveValue("TGFi");

  await page.getByRole("button", { name: "IP Subnet", exact: true }).click();
  await tool().getByLabel("Address and CIDR prefix").fill("2001:db8::1/64");
  await tool().getByLabel("Check address membership").fill("2001:db8::50");
  await tool().getByRole("button", { name: "Calculate subnet" }).click();
  await expect(tool().getByText("2001:db8::/64", { exact: true })).toBeVisible();
  await expect(tool().getByText("2001:db8::50 is inside the subnet")).toBeVisible();
});

test("splits a subnet and opens a later page", async ({ page }) => {
  await page.goto("/?view=calculator");
  await page.getByRole("button", { name: "IP Subnet" }).click();
  await page.getByLabel("Parent subnet").fill("10.0.0.9/16");
  await page.getByLabel("Child prefix").fill("/24");
  await page.getByLabel("Page", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Split subnet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Page 2 of 2" })).toContainText("256 subnets");
  await expect(page.getByLabel("Child subnets")).toHaveValue(/^10\.0\.128\.0\/24[\s\S]*10\.0\.255\.0\/24$/);
});

test("generates QR and barcode images and downloads them", async ({ page }) => {
  await page.goto("/viewer/");
  const format = page.getByLabel("Format");
  const source = page.getByLabel("Source", { exact: true });
  await format.selectOption("qr");
  await source.fill("Lab café");
  const qr = page.getByRole("img", { name: "QR code" });
  await expect.poll(() => qr.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  const [svg] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download SVG" }).click(),
  ]);
  expect(svg.suggestedFilename()).toBe("qr-code.svg");
  expect(await readFile(await svg.path(), "utf8")).toContain("<svg");
  await format.selectOption("barcode");
  await source.fill("hello 🌍");
  await expect(page.getByRole("alert").filter({ hasText: "printable ASCII" })).toBeVisible();
  await source.fill("LAB-42 <&>");
  const barcode = page.getByRole("img", { name: "Code 128 barcode" });
  await expect.poll(() => barcode.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PNG" }).click(),
  ]);
  expect(png.suggestedFilename()).toBe("barcode.png");
  expect((await readFile(await png.path())).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await format.selectOption("qr");
  await expect(source).toHaveValue("Lab café");
});
