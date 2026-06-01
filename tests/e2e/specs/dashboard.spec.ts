import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Dashboard", () => {
  test("muestra KPIs principales con datos del tenant DEMO", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
    await expect(page.locator("text=Afiliados activos")).toBeVisible();
    await expect(page.locator("text=Atenciones activas")).toBeVisible();
    await expect(page.locator("text=Gestiones pendientes")).toBeVisible();
    await expect(page.locator("text=Comités abiertos")).toBeVisible();
  });
});

test.describe("Health + Swagger", () => {
  test("api/v1/health responde ok", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.db).toBe("ok");
  });

  test("api/docs sirve Swagger UI", async ({ page }) => {
    await page.goto("http://localhost:3001/api/docs");
    await expect(page.locator("text=LegalChile PSL API")).toBeVisible();
  });
});
