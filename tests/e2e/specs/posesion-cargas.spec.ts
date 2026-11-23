import { expect, test, type APIRequestContext } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

type AfiliadoE2E = { id: string; rut: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };

async function afiliadoVigente(request: APIRequestContext) {
  const afi = (await request.get(`${API}/afiliados?pageSize=50`).then((r) => r.json())).data as AfiliadoE2E[];
  const a = afi.find((x) => x.vigencia === "Activo" && x.planes.some((p) => p.vigente))!;
  return { ...a, codPlan: a.planes.find((p) => p.vigente)!.codPlan };
}

// RUT válido aleatorio (rango alto para no chocar con el seed).
function rut(): string {
  const cuerpo = String(50_000_000 + Math.floor(Math.random() * 9_000_000));
  let s = 0;
  let m = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    s += Number(cuerpo[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const dv = 11 - (s % 11);
  return `${cuerpo}-${dv === 11 ? "0" : dv === 10 ? "K" : dv}`;
}

test.describe("Posesión efectiva", () => {
  test("se crea con correlativo POSE, se completan causante y herederos y se descarga la ficha", async ({ page, request }) => {
    const afi = await afiliadoVigente(request);
    const competencias = await request.get(`${API}/maestros/competencias`).then((r) => r.json());
    let materia: { id: string; competenciaId: string } | undefined;
    for (const c of competencias as { id: string }[]) {
      const ms = await request.get(`${API}/maestros/materias?competenciaId=${c.id}&aplicaA=PosesionEfectiva&vigente=true`).then((r) => r.json());
      if (ms.length) {
        materia = ms[0];
        break;
      }
    }
    expect(materia).toBeTruthy();
    const res = await request.post(`${API}/atenciones/posesiones`, {
      data: { afiliadoId: afi.id, codPlan: afi.codPlan, competenciaId: materia!.competenciaId, materiaId: materia!.id, asunto: `E2E posesión ${Date.now()}`, causante: {} },
    });
    expect(res.ok()).toBeTruthy();
    const pe = await res.json();
    expect(pe.correlativo).toMatch(/^POSE-\d{4}-\d{6}$/);
    expect(pe.estado).toBe("Ingresada");

    // Sin causante no pasa a "En preparación".
    const sinCausante = await request.post(`${API}/atenciones/${pe.id}/estado`, { data: { estado: "EnPreparacion" } });
    expect(sinCausante.status()).toBe(400);

    await page.goto("/posesiones");
    await expect(page.getByText("Ingrese criterios y presione Buscar")).toBeVisible();
    await page.locator("input[name='correlativo']").fill(pe.correlativo);
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("link", { name: pe.correlativo }).click();

    await expect(page.getByRole("heading", { name: "Posesión efectiva" })).toBeVisible();
    await page.locator("input[name='cn']").fill("Pedro Causante E2E");
    await page.locator("input[name='cr']").fill(rut());
    await page.locator("input[name='cf']").fill("2026-02-01");
    await page.locator("input[name='cd']").fill("Av. Prueba 123");
    await page.getByRole("button", { name: "Guardar causante" }).click();
    await expect(page.getByText("Causante guardado").first()).toBeVisible();

    await page.locator("input[name='hr']").fill(rut());
    await page.locator("input[name='hn']").fill("María Heredera E2E");
    await page.getByRole("button", { name: "Agregar heredero" }).click();
    await expect(page.locator("table td", { hasText: "María Heredera E2E" })).toBeVisible();

    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Ficha de antecedentes/ }).click()]);
    expect(pdf.suggestedFilename()).toBe(`ficha-posesion-${pe.correlativo}.pdf`);

    const ficha = await request.get(`${API}/atenciones/${pe.id}/posesion`).then((r) => r.json());
    expect(ficha.herederos).toHaveLength(1);
  });
});

test.describe("Cargas y bienes", () => {
  test("la carga masiva de cargas aparece en la ficha del afiliado; bienes con error dan reporte", async ({ page, request }) => {
    const afi = await afiliadoVigente(request);
    const rutCarga = rut();
    const csv = `rut_titular,rut,nombres,apellido_paterno,parentesco\n${afi.rut},${rutCarga},Carga,E2E,Hijo\n`;
    const r = await request.post(`${API}/cargas-masivas/cargas?codPlan=${afi.codPlan}&tipo=FLUJO`, {
      multipart: { archivo: { name: "cargas.csv", mimeType: "text/csv", buffer: Buffer.from(csv) } },
    });
    expect(r.ok()).toBeTruthy();
    expect((await r.json()).insertados).toBe(1);

    await page.goto(`/afiliados/${afi.id}`);
    await expect(page.locator("table td", { hasText: rutCarga })).toBeVisible();

    await page.goto("/cargas-masivas");
    await page.locator("p-select").first().click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Bienes" }).click();
    await page.setInputFiles("input[type='file']", {
      name: "bienes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("rut_titular,tipo,identificador\n11111111-1,Barco,X1\n", "utf-8"),
    });
    await page.getByRole("button", { name: /Procesar carga/ }).click();
    await expect(page.locator("table td", { hasText: /Tipo de bien inválido/ })).toBeVisible();
    const [reporte] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar reporte" }).click()]);
    expect(reporte.suggestedFilename()).toMatch(/^carga-bienes-.+\.xlsx$/);
  });
});
