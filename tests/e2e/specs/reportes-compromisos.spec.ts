import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Reporte de compromisos de comité", () => {
  test("lista los compromisos pendientes y descarga el Excel", async ({ page, request }) => {
    const r = await request.get(`${API}/reportes/compromisos?estado=Pendiente`);
    expect(r.ok()).toBeTruthy();
    expect(Array.isArray(await r.json())).toBeTruthy();
    const x = await request.get(`${API}/reportes/compromisos.xlsx?soloVencidos=true`);
    expect(x.headers()["content-type"]).toContain("spreadsheetml");

    await page.goto("/reportes?vista=compromisos");
    await page.getByRole("button", { name: "Generar" }).click();
    await expect(page.locator("p-table").last()).toBeVisible();
  });
});
