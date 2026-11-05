import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

function asUser(perfil: string) {
  const claims = { entraOid: `dev-${perfil.toLowerCase()}`, email: `${perfil.toLowerCase()}@test.cl`, nombre: perfil, perfil };
  return Buffer.from(JSON.stringify(claims), "utf-8").toString("base64");
}

test.describe("Derivación consulta → juicio", () => {
  test("Abogado solicita, no puede aprobar; la jefatura aprueba en la bandeja y nace el juicio", async ({ page, request }) => {
    const abogado = { "X-Dev-User": asUser("ABOGADO") };

    type AfiliadoE2E = { id: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };
    const afi = (await request.get(`${API}/afiliados`, { headers: abogado }).then((r) => r.json())).data as AfiliadoE2E[];
    const activo = afi.find((a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente))!;
    const codPlan = activo.planes.find((p) => p.vigente)!.codPlan;
    const competencias = await request.get(`${API}/maestros/competencias`, { headers: abogado }).then((r) => r.json());
    const laboral = competencias.find((c: { nombre: string }) => c.nombre === "Laboral");
    const materias = await request
      .get(`${API}/maestros/materias?competenciaId=${laboral.id}&aplicaA=Juicio&vigente=true`, { headers: abogado })
      .then((r) => r.json());
    const despido = materias.find((m: { nombre: string }) => m.nombre === "Despido injustificado") ?? materias[0];

    const asunto = `E2E derivación ${Date.now()}`;
    const consulta = await request
      .post(`${API}/atenciones/consultas`, {
        headers: abogado,
        data: { afiliadoId: activo.id, codPlan, competenciaId: laboral.id, materiaId: despido.id, asunto, canalContacto: "Telefonico" },
      })
      .then((r) => r.json());
    expect(consulta.estado).toBe("Iniciada");

    const sol = await request.post(`${API}/atenciones/${consulta.id}/derivaciones`, {
      headers: abogado,
      data: { nuevoTipo: "Juicio", motivo: "Requiere demanda laboral" },
    });
    expect(sol.ok()).toBeTruthy();
    const derivacion = await sol.json();
    const aprobarAbogado = await request.post(`${API}/derivaciones/${derivacion.id}/aprobar`, { headers: abogado, data: {} });
    expect(aprobarAbogado.status()).toBe(403);

    // La jefatura (admin por defecto en modo demo) aprueba desde la bandeja.
    // La bandeja no precarga: viene con estado "Solicitada" y espera a "Buscar".
    await page.goto("/derivaciones");
    await expect(page.getByText("Ingrese criterios y presione Buscar")).toBeVisible();
    await page.getByRole("button", { name: "Buscar" }).click();
    const fila = page.locator("tr", { hasText: consulta.correlativo });
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: "Aprobar" }).click();
    const dialogo = page.locator("p-dynamicdialog .p-dialog").last();
    await dialogo.getByRole("button", { name: "Aceptar" }).click();
    await expect(page.getByText("Derivación aprobada").first()).toBeVisible();

    const original = await request.get(`${API}/atenciones/${consulta.id}`).then((r) => r.json());
    expect(original.estado).toBe("Derivada");
    const lista = await request.get(`${API}/derivaciones?consultaId=${consulta.id}`).then((r) => r.json());
    const juicioId = lista.data[0].atencionDerivadaId;
    const juicio = await request.get(`${API}/atenciones/${juicioId}`).then((r) => r.json());
    expect(juicio.tipo).toBe("Juicio");
    expect(juicio.estado).toBe("Asignada");

    // Requisitos por etapa: sin tribunal ni ROL el juicio no pasa a Pendiente.
    const pend = await request.post(`${API}/atenciones/${juicioId}/estado`, { data: { estado: "Pendiente" } });
    expect(pend.status()).toBe(400);
    expect((await pend.json()).message).toMatch(/tribunal/);
  });
});
