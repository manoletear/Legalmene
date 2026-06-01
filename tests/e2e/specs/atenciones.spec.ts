import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Atenciones flow", () => {
  test("crea consulta, genera correlativo, aparece en lista", async ({ page, request }) => {
    // Setup: necesitamos un afiliado activo en DEMO.
    const afi = await request.get(`${API}/afiliados`).then((r) => r.json());
    const activo = afi.data.find((a: { vigencia: string }) => a.vigencia === "Activo");
    expect(activo, "Debe existir al menos 1 afiliado activo en plan DEMO").toBeTruthy();

    // Crea consulta via UI.
    await page.goto("/atenciones/nueva");

    await page.locator("mat-select[formcontrolname='tipo']").click();
    await page.getByRole("option", { name: "Consulta" }).click();

    await page.locator("mat-select[formcontrolname='afiliadoId']").click();
    // Escape regex metachars en el RUT y match parcial sobre la opción.
    const escaped = activo.rut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await page.getByRole("option", { name: new RegExp(escaped) }).first().click();

    await page.locator("mat-select[formcontrolname='competencia']").click();
    await page.getByRole("option", { name: "Laboral" }).click();

    await page.locator("input[formcontrolname='materia']").fill("Test E2E - despido");
    await page.locator("textarea[formcontrolname='descripcion']").fill("Caso de prueba E2E");

    await page.getByRole("button", { name: /^Crear$/ }).click();

    // Redirige al detail con correlativo CONS-YYYY-...
    await expect(page).toHaveURL(/\/atenciones\/[0-9a-f-]+$/);
    await expect(page.locator("mat-card-title")).toContainText(/CONS-\d{4}-\d{6}/);
    // Tipo es el primer chip del header; estado va segundo.
    await expect(page.locator("mat-chip").first()).toContainText("Consulta");
  });

  test("búsqueda full-text encuentra atención por palabra parcial", async ({ page }) => {
    await page.goto("/atenciones");
    await page.locator("input[placeholder*='despido']").fill("despido");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await expect(page.locator("table tbody tr").first()).toContainText(/despido/i);
  });
});
