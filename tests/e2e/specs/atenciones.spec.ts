import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Atenciones flow", () => {
  test("crea consulta, genera correlativo, aparece en lista", async ({ page, request }) => {
    const afi = await request.get(`${API}/afiliados`).then((r) => r.json());
    const activo = afi.data.find((a: { vigencia: string }) => a.vigencia === "Activo");
    expect(activo, "Debe existir al menos 1 afiliado activo en plan DEMO").toBeTruthy();

    await page.goto("/atenciones/nueva");

    // PrimeNG p-select: click trigger then click option in overlay (appendTo=body).
    await page.locator("p-select[formcontrolname='tipo']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Consulta" }).click();

    await page.locator("p-select[formcontrolname='afiliadoId']").click();
    const escaped = activo.rut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await page.locator(".p-select-overlay .p-select-option").filter({ hasText: new RegExp(escaped) }).first().click();

    await page.locator("p-select[formcontrolname='competencia']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Laboral" }).click();

    await page.locator("input[formcontrolname='materia']").fill("Test E2E - despido");
    await page.locator("textarea[formcontrolname='descripcion']").fill("Caso de prueba E2E");

    await page.getByRole("button", { name: /^Crear$/ }).click();

    await expect(page).toHaveURL(/\/atenciones\/[0-9a-f-]+$/);
    // Header de p-card: usamos h2 del template encabezado.
    await expect(page.locator("h2").first()).toContainText(/CONS-\d{4}-\d{6}/);
    // p-tag con tipo aparece primero en el header.
    await expect(page.locator("p-tag").first()).toContainText("Consulta");
  });

  test("búsqueda full-text encuentra atención por palabra parcial", async ({ page }) => {
    await page.goto("/atenciones");
    await page.locator("input[placeholder*='materia']").fill("despido");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await expect(page.locator("table tbody tr").first()).toContainText(/despido/i);
  });
});
