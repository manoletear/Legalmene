import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Búsqueda de afiliados con coberturas del plan", () => {
  test("buscar por plan muestra sus RUT vigentes y coberturas; la ficha, las de sus planes", async ({ page, request }) => {
    const resumen = await request.get(`${API}/coberturas/resumen-planes?codPlan=DEMO`);
    expect(resumen.ok()).toBeTruthy();
    const [plan] = await resumen.json();
    expect(plan.codPlan).toBe("DEMO");

    await page.goto("/afiliados");
    await page.locator("p-select[name='codPlan']").click();
    await page.getByRole("option", { name: /^DEMO —/ }).click();
    await page.getByRole("button", { name: "Buscar" }).click();
    const panel = page.getByTestId("resumen-planes");
    await expect(panel).toContainText("DEMO");
    await expect(panel).toContainText(`${plan.rutsVigentes} RUT vigentes`);
    if (plan.coberturas.length) await expect(panel.locator("tbody tr")).toHaveCount(plan.coberturas.length);

    // Ficha de un afiliado del plan: coberturas de sus planes vigentes.
    await page.locator("p-table a").first().click();
    await expect(page).toHaveURL(/\/afiliados\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("resumen-planes")).toContainText("Coberturas de sus planes vigentes");
  });

  test("sin plan, canal ni afiliado el resumen se rechaza", async ({ request }) => {
    expect((await request.get(`${API}/coberturas/resumen-planes`)).status()).toBe(400);
  });
});
