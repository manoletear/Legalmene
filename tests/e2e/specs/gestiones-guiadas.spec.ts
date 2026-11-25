import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Gestiones predefinidas y paso siguiente", () => {
  test("sin gestiones predefinidas para la materia se pide a la jefatura que las defina", async ({ page, request }) => {
    // Materia nueva, sin gestiones predefinidas.
    const comp = (await request.get(`${API}/maestros/competencias?vigente=true`).then((r) => r.json()))[0];
    const mat = await request
      .post(`${API}/maestros/materias`, { data: { competenciaId: comp.id, nombre: `Materia sin gestiones ${Date.now()}`, aplicaConsulta: false, aplicaAsesoria: true, aplicaJuicio: false } })
      .then((r) => r.json());
    type A = { id: string; planes: { codPlan: string; vigente: boolean }[] };
    const titular = ((await request.get(`${API}/afiliados?pageSize=200&vigencia=Activo`).then((r) => r.json())).data as A[]).find((a) => a.planes.some((p) => p.vigente))!;
    const codPlan = titular.planes.find((p) => p.vigente)!.codPlan;
    const a = await request
      .post(`${API}/atenciones/asesorias`, { data: { afiliadoId: titular.id, codPlan, competenciaId: comp.id, materiaId: mat.id, asunto: `Sin gestiones ${Date.now()}` } })
      .then((r) => r.json());

    await page.goto(`/atenciones/${a.id}`);
    await page.getByTestId("pedir-gestiones").click();
    const dlg = page.getByRole("dialog").last();
    await dlg.locator("textarea").fill("Es una materia nueva");
    await dlg.getByRole("button", { name: "Aceptar" }).click();
    await expect(page.getByText("Solicitud enviada", { exact: true })).toBeVisible();
    await request.patch(`${API}/maestros/materias/${mat.id}`, { data: { vigente: false } });
  });
});
