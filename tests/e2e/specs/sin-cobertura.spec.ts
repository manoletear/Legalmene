import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

function rutAleatorio(): string {
  const cuerpo = String(50_000_000 + Math.floor(Math.random() * 9_000_000));
  let suma = 0;
  let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (suma % 11);
  return `${cuerpo}-${r === 11 ? "0" : r === 10 ? "K" : r}`;
}

test.describe("Atención sin cobertura del plan", () => {
  test("queda pendiente de Gerencia de Servicios, que la autoriza desde la ficha", async ({ page, request }) => {
    // Afiliado sin planes vigentes → la atención va como Rezagado, que no tiene coberturas.
    const afi = await request.post(`${API}/afiliados`, { data: { rut: rutAleatorio(), nombres: "Sin", apellidoPaterno: "Cobertura" } }).then((r) => r.json());
    type M = { id: string; nombre: string };
    const comps: M[] = await request.get(`${API}/maestros/competencias?vigente=true`).then((r) => r.json());
    let atencion: { id: string; autorizacionCobertura?: { estado: string } | null } | null = null;
    for (const c of comps) {
      const mats: M[] = await request.get(`${API}/maestros/materias?competenciaId=${c.id}&vigente=true&aplicaA=Asesoria`).then((r) => r.json());
      for (const m of mats) {
        const creada = await request
          .post(`${API}/atenciones/asesorias`, { data: { afiliadoId: afi.id, codPlan: "REZAGADO", competenciaId: c.id, materiaId: m.id, asunto: "Sin cobertura E2E" } })
          .then((r) => r.json());
        const leida = await request.get(`${API}/atenciones/${creada.id}`).then((r) => r.json());
        if (leida.autorizacionCobertura?.estado === "Pendiente") {
          atencion = leida;
          break;
        }
      }
      if (atencion) break;
    }
    expect(atencion, "debe existir una materia con arancel para asesorías").toBeTruthy();

    const bloqueo = await request.post(`${API}/atenciones/${atencion!.id}/estado`, { data: { estado: "Pendiente" } });
    expect(bloqueo.status()).toBe(400);
    expect((await bloqueo.json()).message).toMatch(/Gerencia de Servicios/);

    await page.goto(`/atenciones/${atencion!.id}`);
    const aviso = page.getByTestId("autorizacion-cobertura");
    await expect(aviso).toContainText("Sin cobertura del plan");
    await aviso.getByRole("button", { name: "Autorizar atención" }).click();
    await page.getByRole("button", { name: "Aceptar" }).click();
    await expect(aviso).toContainText("Autorizada sin cobertura");
    const despues = await request.get(`${API}/atenciones/${atencion!.id}`).then((r) => r.json());
    expect(despues.autorizacionCobertura.estado).toBe("Autorizada");
  });
});
