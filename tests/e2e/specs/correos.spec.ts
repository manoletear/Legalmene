import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Correos al cliente", () => {
  test("solicitar antecedentes desde la ficha queda en la bitácora de correos", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Correos E2E ${Date.now()}`);
    const ficha = await request.get(`${API}/atenciones/${a.id}`).then((r) => r.json());
    const afiliados = await request.get(`${API}/afiliados?rut=${ficha.afiliado.rut}`).then((r) => r.json());
    const afiliadoId = afiliados.data[0].id;
    const email = `cliente.e2e.${Date.now()}@ejemplo.cl`;
    expect((await request.patch(`${API}/afiliados/${afiliadoId}`, { data: { email } })).ok()).toBeTruthy();

    await page.goto(`/atenciones/${a.id}`);
    await page.getByRole("tab", { name: "Historial" }).click();
    await page.getByRole("button", { name: "Solicitar antecedentes al cliente" }).click();
    const dlg = page.getByRole("dialog").last();
    await dlg.locator("textarea").fill("Copia del contrato\nÚltimas tres liquidaciones");
    await dlg.getByRole("button", { name: "Aceptar" }).click();

    const fila = page.getByTestId("correos").locator("tr", { hasText: "Antecedentes para su atención" });
    await expect(fila).toContainText(email);
    // Sin SES (desarrollo y CI) el correo queda registrado como no enviado.
    await expect(fila).toContainText("No enviado (sin SES)");
  });

  test("la ruta del V°B° de primera presentación existe y solo aplica a juicios", async ({ request }) => {
    const a = await crearAsesoria(request, `VB E2E ${Date.now()}`);
    const r = await request.post(`${API}/atenciones/${a.id}/vb-primera-presentacion`);
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/solo para juicios/);
  });

  test("la respuesta de una consulta se envía al cliente por correo", async ({ page, request }) => {
    type Af = { id: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };
    const afi = ((await request.get(`${API}/afiliados?pageSize=50`).then((r) => r.json())).data as Af[]).find((a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente))!;
    const codPlan = afi.planes.find((p) => p.vigente)!.codPlan;
    const comps = (await request.get(`${API}/maestros/competencias?vigente=true`).then((r) => r.json())) as { id: string }[];
    let consulta: { id: string } | null = null;
    for (const c of comps) {
      const mats = (await request.get(`${API}/maestros/materias?competenciaId=${c.id}&aplicaA=Consulta&vigente=true`).then((r) => r.json())) as { id: string }[];
      if (!mats.length) continue;
      consulta = await request
        .post(`${API}/atenciones/consultas`, { data: { afiliadoId: afi.id, codPlan, competenciaId: c.id, materiaId: mats[0].id, asunto: `Respuesta E2E ${Date.now()}`, canalContacto: "Telefonico" } })
        .then((r) => r.json());
      break;
    }
    const sinRespuesta = await request.post(`${API}/atenciones/${consulta!.id}/enviar-respuesta`);
    expect(sinRespuesta.status()).toBe(400);
    expect((await request.patch(`${API}/afiliados/${afi.id}`, { data: { email: `respuesta.e2e.${Date.now()}@ejemplo.cl` } })).ok()).toBeTruthy();
    expect((await request.patch(`${API}/atenciones/${consulta!.id}`, { data: { respuesta: "Puede reclamar ante la Inspección del Trabajo." } })).ok()).toBeTruthy();

    await page.goto(`/atenciones/${consulta!.id}`);
    await page.getByTestId("enviar-respuesta").click();
    await expect(page.getByText("Respuesta enviada", { exact: true })).toBeVisible();
  });

  test("las condiciones de la atención (copago, pago, plazo de avances) se informan al cliente", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Condiciones E2E ${Date.now()}`);
    const ficha = await request.get(`${API}/atenciones/${a.id}`).then((r) => r.json());
    const afiliados = await request.get(`${API}/afiliados?rut=${ficha.afiliado.rut}`).then((r) => r.json());
    const email = `condiciones.e2e.${Date.now()}@ejemplo.cl`;
    expect((await request.patch(`${API}/afiliados/${afiliados.data[0].id}`, { data: { email } })).ok()).toBeTruthy();
    expect((await request.patch(`${API}/atenciones/${a.id}`, { data: { plazoPrimerosAvances: "2030-01-15" } })).ok()).toBeTruthy();

    await page.goto(`/atenciones/${a.id}`);
    await page.getByTestId("informar-condiciones").click();
    await expect(page.getByText("Condiciones informadas", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(page.getByTestId("correos").locator("tr", { hasText: "Condiciones de su atención" })).toContainText(email);
  });
});
