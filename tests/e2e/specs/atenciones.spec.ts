import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Atenciones flow", () => {
  test("crea consulta, genera correlativo, aparece en lista", async ({ page, request }) => {
    const afi = await request.get(`${API}/afiliados`).then((r) => r.json());
    type AfiliadoE2E = { rut: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };
    const activo = (afi.data as AfiliadoE2E[]).find(
      (a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente),
    );
    expect(activo, "Debe existir al menos 1 afiliado con plan vigente").toBeTruthy();
    const planVigente = activo!.planes.find((p) => p.vigente)!.codPlan;

    await page.goto("/atenciones/nueva");

    // PrimeNG p-select: click trigger then click option in overlay (appendTo=body).
    await page.locator("p-select[formcontrolname='tipo']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Consulta" }).click();

    await page.locator("p-select[formcontrolname='afiliadoId']").click();
    const escaped = activo!.rut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await page.locator(".p-select-overlay .p-select-option").filter({ hasText: new RegExp(escaped) }).first().click();

    // Al elegir el afiliado se carga su plan vigente como plan de la atención.
    await expect(page.locator("p-select[formcontrolname='codPlan']")).toContainText(planVigente);

    await page.locator("p-select[formcontrolname='competenciaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Laboral" }).click();
    // Las materias se filtran por competencia y por tipo de atención.
    await page.locator("p-select[formcontrolname='materiaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Despido injustificado" }).click();

    await page.locator("input[formcontrolname='asunto']").fill("Test E2E - despido");
    await page.locator("textarea[formcontrolname='descripcion']").fill("Caso de prueba E2E");

    await page.getByRole("button", { name: /^Crear$/ }).click();

    await expect(page).toHaveURL(/\/atenciones\/[0-9a-f-]+$/);
    // Correlativo visible en algún punto de la página (h1, h2 o span según diseño).
    await expect(page.locator("text=/CONS-\\d{4}-\\d{6}/").first()).toBeVisible();
    // breadcrumb con el tipo de caso visible (rutaPrincipal("Consulta") → "Consultas").
    await expect(page.locator("text=Consultas").first()).toBeVisible();
    await expect(page.getByText("Despido injustificado").first()).toBeVisible();
  });

  test("búsqueda full-text encuentra atención por palabra parcial", async ({ page }) => {
    await page.goto("/atenciones");
    await page.locator("input[placeholder*='materia']").fill("despido");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await expect(page.locator("table tbody tr").first()).toContainText(/despido/i);
  });
});
