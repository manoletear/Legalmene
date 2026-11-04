import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";
const COD_PLAN = "DEMO";

function asUser(rol: string) {
  const claims = {
    entraOid: `dev-${rol.toLowerCase()}`,
    email: `${rol.toLowerCase()}@test.cl`,
    nombre: rol,
    rol,
    codPlanes: [COD_PLAN],
  };
  return Buffer.from(JSON.stringify(claims), "utf-8").toString("base64");
}

test.describe("Aranceles y provisiones", () => {
  test("la matriz de aranceles muestra el catálogo del plan", async ({ page }) => {
    await page.goto("/aranceles");
    await expect(page.getByText("A-LAB-01")).toBeVisible();
    await expect(page.getByText("Juicio por despido injustificado")).toBeVisible();
  });

  test("Abogado solicita pero NO aprueba; Supervisor aprueba y el saldo se actualiza", async ({ request }) => {
    const abogado = { "X-Cod-Plan": COD_PLAN, "X-Dev-User": asUser("Abogado") };
    const supervisor = { "X-Cod-Plan": COD_PLAN, "X-Dev-User": asUser("Supervisor") };

    const afi = await request.get(`${API}/afiliados`, { headers: abogado }).then((r) => r.json());
    const activo = afi.data.find((a: { vigencia: string }) => a.vigencia === "Activo");
    const caso = await request
      .post(`${API}/atenciones/juicios`, {
        headers: abogado,
        data: { afiliadoId: activo.id, competencia: "Laboral", materia: "E2E provisiones" },
      })
      .then((r) => r.json());

    const solicitud = await request.post(`${API}/atenciones/${caso.id}/provisiones`, {
      headers: abogado,
      data: { monto: 200_000, motivo: "Peritaje E2E" },
    });
    expect(solicitud.ok()).toBeTruthy();
    const provision = await solicitud.json();
    expect(provision.estado).toBe("Solicitada");

    const aprobarAbogado = await request.put(`${API}/provisiones/${provision.id}/aprobar`, {
      headers: abogado,
      data: {},
    });
    expect(aprobarAbogado.status()).toBe(403);

    const aprobar = await request.put(`${API}/provisiones/${provision.id}/aprobar`, {
      headers: supervisor,
      data: { observacion: "OK" },
    });
    expect(aprobar.ok()).toBeTruthy();

    const gasto = await request.post(`${API}/provisiones/${provision.id}/movimientos`, {
      headers: abogado,
      data: { tipo: "Gasto", monto: 50_000, glosa: "Honorario perito" },
    });
    expect(gasto.ok()).toBeTruthy();

    const resumen = await request
      .get(`${API}/atenciones/${caso.id}/provisiones`, { headers: abogado })
      .then((r) => r.json());
    expect(resumen.resumen).toEqual({ aprobado: 200_000, utilizado: 50_000, disponible: 150_000, pendiente: 0 });
  });
});
