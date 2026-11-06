import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Dashboard", () => {
  test("muestra KPIs principales con datos del tenant DEMO", async ({ page }) => {
    await page.goto("/dashboard");
    // h1 ahora es el saludo personalizado; comprobamos que cargó la página.
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("Casos abiertos", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Consultas del día", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("SLA por vencer", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Provisiones pendientes", { exact: true }).first()).toBeVisible();
  });
});

test.describe("Health + Swagger", () => {
  test("api/v1/health responde ok", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.db.status).toBe("ok");
  });

  test("api/docs sirve Swagger UI", async ({ page }) => {
    await page.goto("http://localhost:3001/api/docs");
    await expect(page.locator("text=NEXUS API (Legal Chile)")).toBeVisible();
  });
});
