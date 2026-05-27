import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const testDataDirectory = path.join(os.tmpdir(), `daily-planner-playwright-${process.pid}`);

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
    command: "npm run build && uv run --project .. uvicorn app_planner.api:app --app-dir .. --host 127.0.0.1 --port 8180",
    env: {
      ...process.env,
      PLANNER_DB_PATH: path.join(testDataDirectory, "planner.db"),
      PROJECT_MGMT_DB_PATH: path.join(testDataDirectory, "project_mgmt.db"),
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:8180/api/health",
  },
});
