import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Búsquedas sin precarga", () => {
  test("afiliados: no muestra datos hasta presionar Buscar", async ({ page, request }) => {
    const afi = (await request.get(`${API}/afiliados?pageSize=1`).then((r) => r.json())).data[0] as { rut: string };

    await page.goto("/afiliados");
    await expect(page.getByText("Ingrese criterios y presione Buscar")).toBeVisible();
    await expect(page.locator("p-table")).toHaveCount(0);

    // Sin criterios avisa y no busca.
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("Ingrese al menos un criterio de búsqueda").first()).toBeVisible();
    await expect(page.locator("p-table")).toHaveCount(0);

    await page.locator("input[name='rut']").fill(afi.rut);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.locator("table tbody tr", { hasText: afi.rut })).toBeVisible();

    await page.getByRole("button", { name: "Limpiar" }).click();
    await expect(page.getByText("Ingrese criterios y presione Buscar")).toBeVisible();
  });

  test("consultas: exporta a Excel la búsqueda ejecutada", async ({ page }) => {
    await page.goto("/consultas");
    const exportar = page.getByRole("button", { name: "Exportar Excel" });
    await expect(exportar).toBeDisabled();
    await page.locator("input[name='fechaDesde']").fill("2000-01-01");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.locator("p-table")).toBeVisible();
    await expect(exportar).toBeEnabled();
    const [descarga] = await Promise.all([page.waitForEvent("download"), exportar.click()]);
    expect(descarga.suggestedFilename()).toMatch(/^consultas-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

test.describe("Reportes", () => {
  test("por plan muestra las cifras que calcula la API", async ({ page, request }) => {
    const hasta = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const filas = (await request.get(`${API}/reportes/plan?desde=2000-01-01&hasta=${hasta}`).then((r) => r.json())) as {
      codPlan: string;
      total: number;
      afiliadosVigentes: number;
    }[];
    const fila = filas.find((f) => f.total > 0) ?? filas[0];
    expect(fila).toBeTruthy();

    await page.goto("/reportes");
    await expect(page.getByText("Elija el período y presione Generar").first()).toBeVisible();
    await page.locator("input[name='desde']").fill("2000-01-01");
    await page.locator("input[name='hasta']").fill(hasta);
    await page.getByRole("button", { name: "Generar" }).first().click();

    const tr = page.locator("table tbody tr", { hasText: fila.codPlan }).first();
    await expect(tr).toBeVisible();
    await expect(tr.locator("td").nth(2)).toHaveText(fila.afiliadosVigentes.toLocaleString("es-CL"));
    await expect(tr.locator("td").nth(7)).toHaveText(fila.total.toLocaleString("es-CL"));
    await expect(page.getByText("fórmula a validar con LegalChile")).toBeVisible();
  });
});
