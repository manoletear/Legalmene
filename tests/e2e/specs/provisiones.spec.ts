import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

function asUser(perfil: string) {
  const claims = {
    entraOid: `dev-${perfil.toLowerCase()}`,
    email: `${perfil.toLowerCase()}@test.cl`,
    nombre: perfil,
    perfil,
  };
  return Buffer.from(JSON.stringify(claims), "utf-8").toString("base64");
}

test.describe("Aranceles y provisiones", () => {
  test("la matriz de aranceles muestra el catálogo por materia", async ({ page }) => {
    await page.goto("/aranceles");
    await expect(page.getByText("A-LAB-01")).toBeVisible();
    await expect(page.getByText("Juicio por despido injustificado")).toBeVisible();
  });

  test("ciclo de provisión con los perfiles del Anexo: Abogado, Contador, Supervisor y Finanzas", async ({ request }) => {
    const abogado = { "X-Dev-User": asUser("ABOGADO") };
    const supervisor = { "X-Dev-User": asUser("GERENCIA_SERVICIOS") };
    const contador = { "X-Dev-User": asUser("CONTADOR") };
    const finanzas = { "X-Dev-User": asUser("GERENCIA_FINANZAS") };

    const afi = await request.get(`${API}/afiliados`, { headers: abogado }).then((r) => r.json());
    type AfiliadoE2E = { id: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };
    const activo = (afi.data as AfiliadoE2E[]).find(
      (a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente),
    );
    expect(activo, "Debe existir un afiliado con plan vigente").toBeTruthy();
    const codPlan = activo!.planes.find((p) => p.vigente)!.codPlan;
    const competencias = await request.get(`${API}/maestros/competencias`, { headers: abogado }).then((r) => r.json());
    const laboral = competencias.find((c: { nombre: string }) => c.nombre === "Laboral");
    const materiasLab = await request
      .get(`${API}/maestros/materias?competenciaId=${laboral.id}&aplicaA=Juicio&vigente=true`, { headers: abogado })
      .then((r) => r.json());
    const caso = await request
      .post(`${API}/atenciones/juicios`, {
        headers: abogado,
        data: {
          afiliadoId: activo!.id,
          codPlan,
          competenciaId: laboral.id,
          materiaId: materiasLab[0].id,
          asunto: "E2E provisiones",
        },
      })
      .then((r) => r.json());

    const solicitud = await request.post(`${API}/atenciones/${caso.id}/provisiones`, {
      headers: abogado,
      data: { monto: 200_000, motivo: "Peritaje E2E" },
    });
    expect(solicitud.ok()).toBeTruthy();
    const provision = await solicitud.json();
    expect(provision.estado).toBe("Solicitada");
    const paso = (accion: string, headers: Record<string, string>, data: object = {}) =>
      request.post(`${API}/provisiones/${provision.id}/${accion}`, { headers, data });

    expect((await paso("pago-cliente", abogado, { medio: "Transferencia" })).status()).toBe(403);
    expect((await paso("pago-cliente", contador, { medio: "Transferencia" })).ok()).toBeTruthy();
    expect((await paso("solicitar-entrega", abogado)).ok()).toBeTruthy();
    expect((await paso("autorizar", abogado)).status()).toBe(403);
    expect((await paso("autorizar", supervisor, { observacion: "OK" })).ok()).toBeTruthy();
    expect((await paso("disponible", finanzas)).ok()).toBeTruthy();
    expect((await paso("entregar", finanzas)).ok()).toBeTruthy();

    const gasto = await request.post(`${API}/provisiones/${provision.id}/movimientos`, {
      headers: abogado,
      data: { tipo: "Gasto", monto: 50_000, glosa: "Honorario perito" },
    });
    expect(gasto.ok()).toBeTruthy();
    const rendirAntes = await paso("rendir", abogado);
    expect(rendirAntes.status()).toBe(400);
    expect((await rendirAntes.json()).message).toMatch(/saldo por rendir/);
    await request.post(`${API}/provisiones/${provision.id}/movimientos`, {
      headers: abogado,
      data: { tipo: "Reintegro", monto: 150_000, glosa: "Saldo devuelto" },
    });
    expect((await paso("rendir", abogado)).ok()).toBeTruthy();

    const resumen = await request
      .get(`${API}/atenciones/${caso.id}/provisiones`, { headers: abogado })
      .then((r) => r.json());
    expect(resumen.resumen).toEqual({
      provisionado: 200_000,
      entregado: 200_000,
      utilizado: 50_000,
      reintegrado: 150_000,
      saldoPorRendir: 0,
      pendientePago: 0,
    });
  });
});
