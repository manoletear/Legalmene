import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Correcciones del administrador", () => {
  test("reabre una consulta terminada desde la pantalla de correcciones", async ({ page, request }) => {
    const afi = (await request.get(`${API}/afiliados?pageSize=50`).then((r) => r.json())).data as {
      id: string;
      vigencia: string;
      planes: { codPlan: string; vigente: boolean }[];
    }[];
    const activo = afi.find((a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente))!;
    const codPlan = activo.planes.find((p) => p.vigente)!.codPlan;
    const comps = (await request.get(`${API}/maestros/competencias?vigente=true`).then((r) => r.json())) as { id: string }[];
    let consulta: { id: string; correlativo: string } | null = null;
    for (const c of comps) {
      const mats = (await request.get(`${API}/maestros/materias?competenciaId=${c.id}&aplicaA=Consulta&vigente=true`).then((r) => r.json())) as { id: string }[];
      if (!mats.length) continue;
      consulta = await request
        .post(`${API}/atenciones/consultas`, {
          data: { afiliadoId: activo.id, codPlan, competenciaId: c.id, materiaId: mats[0].id, asunto: `Corrección E2E ${Date.now()}`, canalContacto: "Telefonico" },
        })
        .then((r) => r.json());
      break;
    }
    expect(consulta).toBeTruthy();
    const term = await request.post(`${API}/atenciones/${consulta!.id}/estado`, { data: { estado: "Terminada" } });
    expect(term.ok(), await term.text()).toBeTruthy();

    await page.goto("/admin/correcciones");
    await page.locator("input[name='correlativo']").fill(consulta!.correlativo);
    await page.getByRole("button", { name: "Buscar" }).click();
    const panorama = page.getByTestId("panorama");
    await expect(panorama).toContainText("Terminada");
    await panorama.getByRole("button", { name: "Reabrir atención" }).click();
    const dlg = page.getByRole("dialog").last();
    await dlg.locator("textarea").fill("Se terminó por error");
    await dlg.getByRole("button", { name: "Aceptar" }).click();
    await expect(panorama).toContainText("Iniciada");

    const ficha = await request.get(`${API}/atenciones/${consulta!.id}`).then((r) => r.json());
    expect(ficha.estado).toBe("Iniciada");
    expect(ficha.metadata.correcciones[0].motivo).toBe("Se terminó por error");
  });
});
