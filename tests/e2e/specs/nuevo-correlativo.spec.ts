import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

type Maestro = { id: string; nombre: string };

test.describe("Nuevo correlativo", () => {
  test("crea otra consulta de la misma llamada con otra competencia y materia, y abre su ficha", async ({ page, request }) => {
    const lista = await request.get(`${API}/atenciones?pageSize=20&tipo=Consulta`).then((r) => r.json());
    const origen = lista.data.find((a: { estado: string }) => a.estado !== "Terminada") ?? lista.data[0];
    const comps: Maestro[] = await request.get(`${API}/maestros/competencias?vigente=true`).then((r) => r.json());
    // Otra competencia que tenga materias para consultas.
    let destino: { comp: Maestro; materia: Maestro } | null = null;
    for (const c of comps.filter((x) => x.id !== origen.competenciaId)) {
      const mats: Maestro[] = await request.get(`${API}/maestros/materias?competenciaId=${c.id}&vigente=true&aplicaA=Consulta`).then((r) => r.json());
      if (mats.length) {
        destino = { comp: c, materia: mats[0] };
        break;
      }
    }
    expect(destino, "debe existir otra competencia con materias de consulta").toBeTruthy();

    await page.goto(`/atenciones/${origen.id}`);
    await page.getByRole("button", { name: "Nuevo correlativo" }).click();
    const dlg = page.getByRole("dialog", { name: "Nuevo correlativo" });
    await dlg.locator("p-select[name='ncCompetencia']").click();
    await page.getByRole("option", { name: destino!.comp.nombre, exact: true }).click();
    await dlg.locator("p-select[name='ncMateria']").click();
    await page.getByRole("option", { name: destino!.materia.nombre, exact: true }).click();
    await dlg.locator("input[name='ncAsunto']").fill("Segunda consulta E2E");
    await dlg.getByRole("button", { name: "Crear correlativo" }).click();

    await expect(page).not.toHaveURL(new RegExp(origen.id));
    await expect(page).toHaveURL(/\/atenciones\/[0-9a-f-]{36}$/);
    const nuevoId = page.url().split("/").pop()!;
    const nueva = await request.get(`${API}/atenciones/${nuevoId}`).then((r) => r.json());
    expect(nueva).toMatchObject({ tipo: "Consulta", competenciaId: destino!.comp.id, materiaId: destino!.materia.id, asunto: "Segunda consulta E2E" });
    expect(nueva.afiliadoId).toBe(origen.afiliadoId);
    // La ficha muestra la nueva atención (no la de origen).
    // (el toast también muestra el correlativo, por eso se busca fuera de él).
    await expect(page.locator("lm-atencion-detail").getByText(nueva.correlativo, { exact: true })).toBeVisible();
    await expect(page.locator("lm-atencion-detail").getByText(origen.correlativo, { exact: true })).toHaveCount(0);
    await expect(page.locator("lm-atencion-detail").getByText(destino!.materia.nombre).first()).toBeVisible();
  });
});
