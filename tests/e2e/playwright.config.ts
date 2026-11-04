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
          command: process.env.CI
            ? "node apps/api/dist/apps/api/src/main.js"
            : "pnpm api:dev",
          url: `${API_BASE}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 90_000,
          cwd: "../..",
          env: process.env.CI
            ? {
                PORT: "3001",
                DATABASE_URL: process.env.DATABASE_URL ?? "",
                AUTH_DISABLED: "true",
                STORAGE_BACKEND: "local",
                DOCUMENTS_LOCAL_DIR: "./data/docs",
                DOCUMENTS_LOCAL_SECRET: "ci-secret",
                API_PUBLIC_URL: "http://localhost:3001",
              }
            : {},
        },
        {
          command: process.env.CI
            ? "npx serve apps/web/dist/web/browser -p 4200 -s --no-clipboard"
            : "pnpm web:dev",
          url: WEB_BASE,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
          cwd: "../..",
        },
      ],
});
