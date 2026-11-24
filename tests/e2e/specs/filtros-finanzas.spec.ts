import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Filtros de finanzas por tipo", () => {
  test("aranceles y provisiones se filtran por tipo de atención; pagos por tipo de pago", async ({ request }) => {
    const juicios = await request.get(`${API}/aranceles-atencion?tipoAtencion=Juicio`).then((r) => r.json());
    expect(Array.isArray(juicios)).toBe(true);
    expect((juicios as { tipo: string }[]).every((a) => a.tipo === "Juicio")).toBe(true);
    const asesorias = await request.get(`${API}/aranceles-atencion?tipoAtencion=Asesoria`).then((r) => r.json());
    expect((asesorias as { tipo: string }[]).every((a) => a.tipo === "Asesoria")).toBe(true);

    const provs = await request.get(`${API}/provisiones?tipoAtencion=Juicio&pageSize=200`).then((r) => r.json());
    const correlativos = (provs.data as { correlativo: string }[]).map((p) => p.correlativo);
    expect(correlativos.every((c) => /^JUI/.test(c))).toBe(true);

    const plan = await request.get(`${API}/pagos?tipoPago=Plan&pageSize=200`).then((r) => r.json());
    expect((plan.data as { atencionId: string | null }[]).every((p) => p.atencionId === null)).toBe(true);
    const arancel = await request.get(`${API}/pagos?tipoPago=Arancel&pageSize=200`).then((r) => r.json());
    expect((arancel.data as { atencionId: string | null }[]).every((p) => p.atencionId !== null)).toBe(true);
    expect((await request.get(`${API}/pagos?tipoPago=Otro`)).status()).toBe(400);
  });

  test("la búsqueda de provisiones ofrece el filtro por tipo de atención", async ({ page }) => {
    await page.goto("/provisiones");
    await page.locator("p-select[name='tipoAtencion']").click();
    await page.getByRole("option", { name: "Juicio" }).click();
    await page.getByRole("button", { name: "Buscar" }).click();
    // Todas las filas listadas son juicios (o no hay resultados).
    const filas = page.locator("tbody tr a.lm-mono");
    for (const t of await filas.allTextContents()) expect(t.trim()).toMatch(/^JUI/);
  });
});
