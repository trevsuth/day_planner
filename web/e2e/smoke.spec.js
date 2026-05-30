import { expect, test } from "@playwright/test";

async function openProjects(page) {
  await page
    .getByRole("navigation", { name: "Application views" })
    .getByRole("button", { name: "Projects" })
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
    .getByRole("button", { name: "API" })
    .click();
  await expect(page.getByRole("heading", { name: "Local API" })).toBeVisible();
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
    .getByRole("button", { name: "Planner" })
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
    .getByRole("button", { name: "Planner" })
    .click();
  await page.getByLabel("Planner date").fill("2031-01-16");
  await expect(page.getByRole("button", { name: "Card", exact: true })).toBeVisible();
  await page.getByLabel("Remove card assignment").click();
  await expect(page.locator(".priority-row input").first()).toHaveValue("");
});
