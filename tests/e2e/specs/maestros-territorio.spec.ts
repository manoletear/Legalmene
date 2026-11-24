import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Maestros: canales y territorio", () => {
  test("se crea un canal y una comuna, y el formulario del afiliado ofrece la comuna de la región", async ({ page, request }) => {
    const suf = Date.now().toString(36);
    await page.goto("/admin/maestros");

    await page.getByRole("tab", { name: "Canales" }).click();
    await page.locator("input[name='nombre']").fill(`Canal E2E ${suf}`);
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.locator("td", { hasText: `Canal E2E ${suf}` })).toBeVisible();

    await page.getByRole("tab", { name: "Comunas" }).click();
    await page.locator("p-select[name='regionId']").click();
    await page.getByRole("option", { name: "Ñuble" }).click();
    await page.locator("input[name='nombre']").fill(`Comuna E2E ${suf}`);
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.locator("tr", { hasText: `Comuna E2E ${suf}` })).toContainText("Ñuble");

    const canales = await request.get(`${API}/canales`).then((r) => r.json());
    expect(canales.some((c: { nombre: string }) => c.nombre === `Canal E2E ${suf}`)).toBeTruthy();

    // Formulario del afiliado: al elegir la región aparecen sus comunas.
    await page.goto("/afiliados");
    await page.getByRole("button", { name: "Nuevo afiliado" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("p-select[name='region'] .p-select-dropdown").click();
    await page.getByRole("option", { name: "Ñuble" }).click();
    await dlg.locator("p-select[name='comuna'] .p-select-dropdown").click();
    await expect(page.getByRole("option", { name: `Comuna E2E ${suf}` })).toBeVisible();
  });
});
