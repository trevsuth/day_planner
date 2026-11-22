import { defineConfig, devices } from "@playwright/test";

const databaseSchema = `playwright_${process.pid}`;
const databaseUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://daily_planner:daily_planner@127.0.0.1:5432/daily_planner";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:8180",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm --prefix ../obsidian-arrow run build:hosted && uv run --project .. uvicorn app_planner.api:app --app-dir .. --host 127.0.0.1 --port 8180",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SCHEMA: databaseSchema,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8180/api/health",
  },
});
