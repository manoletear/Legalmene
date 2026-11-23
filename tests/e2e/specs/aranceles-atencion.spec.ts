import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

function asUser(perfil: string) {
  const claims = { entraOid: `dev-${perfil.toLowerCase()}`, email: `${perfil.toLowerCase()}@test.cl`, nombre: perfil, perfil };
  return Buffer.from(JSON.stringify(claims), "utf-8").toString("base64");
}

// UF de una fecha propia del test, para no depender de la UF real del día.
const FECHA_PAGO = "2001-03-15";

test.describe("Arancel por atención", () => {
  test("rojo → naranjo → amarillo → verde con roles; la atención espera el pago", async ({ page, request }) => {
    const abogado = { "X-Dev-User": asUser("ABOGADO") };
    const supervisor = { "X-Dev-User": asUser("GERENCIA_SERVICIOS") };
    const contador = { "X-Dev-User": asUser("CONTADOR") };

    // El administrador (usuario por defecto en demo) carga la UF de la fecha de pago.
    const uf = await request.put(`${API}/valores-uf`, { data: { fecha: FECHA_PAGO, valorCentavos: 1_600_000 } });
    expect(uf.ok()).toBeTruthy();

    type AfiliadoE2E = { id: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };
    const afi = (await request.get(`${API}/afiliados`, { headers: abogado }).then((r) => r.json())).data as AfiliadoE2E[];
    const activo = afi.find((a) => a.vigencia === "Activo" && a.planes.some((p) => p.codPlan === "DEMO" && p.vigente))!;
    expect(activo, "Debe existir un afiliado vigente en DEMO").toBeTruthy();
    const competencias = await request.get(`${API}/maestros/competencias`, { headers: abogado }).then((r) => r.json());
    const laboral = competencias.find((c: { nombre: string }) => c.nombre === "Laboral");
    const materias = await request
      .get(`${API}/maestros/materias?competenciaId=${laboral.id}&aplicaA=Juicio&vigente=true`, { headers: abogado })
      .then((r) => r.json());
    const despido = materias.find((m: { nombre: string }) => m.nombre === "Despido injustificado");

    // DEMO cubre 80% del juicio por despido (arancel 12 UF): copago 2,4 UF.
    const juicio = await request
      .post(`${API}/atenciones/juicios`, {
        headers: abogado,
        data: { afiliadoId: activo.id, codPlan: "DEMO", competenciaId: laboral.id, materiaId: despido.id, asunto: `E2E arancel ${Date.now()}` },
      })
      .then((r) => r.json());
    const arancel = await request.get(`${API}/atenciones/${juicio.id}/arancel`, { headers: abogado }).then((r) => r.json());
    expect(arancel.estado).toBe("Requerido");
    expect(arancel.copagoUfCentesimas).toBe(240);

    const bloqueo = await request.post(`${API}/atenciones/${juicio.id}/estado`, { headers: abogado, data: { estado: "EnEsperaAntecedentes" } });
    expect(bloqueo.status()).toBe(400);
    expect((await bloqueo.json()).message).toMatch(/pago del arancel/);

    const accion = (a: string, headers: Record<string, string>, data: object = {}) =>
      request.post(`${API}/atenciones/${juicio.id}/arancel/${a}`, { headers, data });
    expect((await accion("enviar", abogado)).ok()).toBeTruthy();
    expect((await accion("aprobar", abogado)).status()).toBe(403);
    expect((await accion("aprobar", supervisor)).ok()).toBeTruthy();
    expect((await accion("pago", abogado, { medio: "CasaCentral", fechaPago: FECHA_PAGO })).status()).toBe(403);
    const pago = await accion("pago", contador, { medio: "CasaCentral", fechaPago: FECHA_PAGO });
    expect(pago.ok()).toBeTruthy();
    const pagado = await pago.json();
    expect(pagado.estado).toBe("Pagado");
    expect(pagado.montoClp).toBe(38_400); // 2,4 UF × $16.000

    // La ficha muestra el arancel pagado (verde).
    await page.goto(`/atenciones/${juicio.id}`);
    await expect(page.getByTestId("arancel-estado")).toContainText("Pagado");
  });
});
