import { expect, test } from "@playwright/test";

test.describe("Cargas masivas", () => {
  test("procesa CSV FLUJO y muestra resultado con errores", async ({ page }) => {
    await page.goto("/cargas-masivas");

    // 2 válidos + 1 RUT con DV deliberadamente incorrecto (12345678 → DV correcto es 5, no 9).
    const csv =
      "rut,nombres,apellido_paterno,apellido_materno,email\n" +
      "33333333-3,Pedro,E2E,Test,pedro.e2e@test.cl\n" +
      "44444444-4,Ana,E2E,Test,ana.e2e@test.cl\n" +
      "12345678-9,Mal,Rut,,bad@test.cl\n";

    await page.setInputFiles("input[type='file']", {
      name: "demo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    await page.getByRole("button", { name: /Procesar carga/ }).click();

    // Espera el resultado (KPI cards aparecen tras post).
    await expect(page.locator("small", { hasText: "Total filas" })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("small", { hasText: "Nuevos en el plan" })).toBeVisible();
    await expect(page.locator("h4", { hasText: "Errores" })).toBeVisible();

    // Al menos 1 error con texto "RUT inv" en la tabla de errores.
    await expect(page.locator("table td", { hasText: /RUT inv/i }).first()).toBeVisible();
  });
});

test.describe("Carga masiva de atenciones", () => {
  test("crea atenciones con el flujo normal; en pantalla solo admite FLUJO", async ({ page, request }) => {
    const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";
    const afis = (await request.get(`${API}/afiliados?pageSize=50`).then((r) => r.json())).data as {
      rut: string;
      vigencia: string;
      planes: { codPlan: string; vigente: boolean }[];
    }[];
    const afi = afis.find((x) => x.vigencia === "Activo" && x.planes.some((p) => p.vigente))!;
    const codPlan = afi.planes.find((p) => p.vigente)!.codPlan;
    const comps = (await request.get(`${API}/maestros/competencias?vigente=true`).then((r) => r.json())) as { id: string; nombre: string }[];
    let fila = "";
    for (const c of comps) {
      const mats = (await request.get(`${API}/maestros/materias?competenciaId=${c.id}&aplicaA=Consulta&vigente=true`).then((r) => r.json())) as { nombre: string }[];
      if (mats.length) {
        fila = `${afi.rut},Consulta,"${c.nombre}","${mats[0].nombre}",Consulta cargada E2E`;
        break;
      }
    }
    const asunto = `Atención cargada E2E ${Date.now()}`;
    const csv = `rut,tipo,competencia,materia,asunto\n${fila.replace("Consulta cargada E2E", asunto)}\n${afi.rut},Juicio,X,Y,Mala\n`;
    const r = await request.post(`${API}/cargas-masivas/atenciones?codPlan=${codPlan}&tipo=FLUJO`, {
      multipart: { archivo: { name: "atenciones.csv", mimeType: "text/csv", buffer: Buffer.from(csv) } },
    });
    expect(r.ok()).toBeTruthy();
    const res = await r.json();
    expect(res.insertados).toBe(1);
    expect(res.errores).toHaveLength(1);
    const stock = await request.post(`${API}/cargas-masivas/atenciones?codPlan=${codPlan}&tipo=STOCK`, {
      multipart: { archivo: { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from(csv) } },
    });
    expect(stock.status()).toBe(400);

    await page.goto("/cargas-masivas");
    await page.locator("p-select").first().click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Atenciones" }).click();
    await expect(page.locator("p-select").nth(2)).toHaveClass(/p-disabled/);
    await page.getByText("Formato CSV esperado").click();
    await expect(page.locator("pre", { hasText: "rut,tipo,competencia,materia,asunto" })).toBeVisible();
  });
});
