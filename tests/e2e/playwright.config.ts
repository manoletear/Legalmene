import { defineConfig, devices } from "@playwright/test";

const WEB_BASE = process.env.WEB_BASE ?? "http://localhost:4200";
const API_BASE = process.env.API_BASE ?? "http://localhost:3001/api/v1";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false, // Tests muta DB compartida; serial evita interferencia.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: WEB_BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      "X-Cod-Plan": "DEMO",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: "pnpm api:dev",
          url: `${API_BASE}/health`,
          reuseExistingServer: true,
          timeout: 90_000,
          cwd: "../..",
        },
        {
          command: "pnpm web:dev",
          url: WEB_BASE,
          reuseExistingServer: true,
          timeout: 120_000,
          cwd: "../..",
        },
      ],
});
