import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

function devUser(perfil: string, alias: string) {
  const claims = { entraOid: `dev-${alias}`, email: `${alias}@test.cl`, nombre: `E2E ${alias}`, perfil };
  return { "X-Dev-User": Buffer.from(JSON.stringify(claims)).toString("base64") };
}

test.describe("V°B° de jefatura para terminar", () => {
  test("el término se solicita desde la ficha y lo aprueba otra jefatura", async ({ page, request }) => {
    const a = await crearAsesoria(request, `VB E2E ${Date.now()}`);
    // Terminar directo no se permite en asesorías.
    const causas = await request.get(`${API}/maestros/causas-termino?vigente=true`).then((r) => r.json());
    const directo = await request.post(`${API}/atenciones/${a.id}/estado`, { data: { estado: "Terminada", causaTerminoId: causas[0].id } });
    expect(directo.status()).toBe(400);
    expect((await directo.json()).message).toMatch(/V°B°/);

    const pendiente = await request.post(`${API}/atenciones/${a.id}/estado`, { data: { estado: "Pendiente" } });
    expect(pendiente.status(), await pendiente.text()).toBe(201);
    await page.goto(`/atenciones/${a.id}`);
    await page.getByTestId("estado-destino").click();
    await page.getByRole("option", { name: "Terminada" }).click();
    await page.locator("p-select[placeholder='Causa de término']").click();
    await page.getByRole("option", { name: causas[0].nombre }).click();
    await page.getByRole("button", { name: "Solicitar término (V°B°)" }).click();
    const aviso = page.getByTestId("solicitud-termino");
    await expect(aviso).toContainText("Término solicitado");
    // Quien solicitó no ve los botones de V°B° y la API se lo impide.
    await expect(aviso.getByRole("button", { name: "Dar V°B° y terminar" })).toHaveCount(0);
    expect((await request.post(`${API}/atenciones/${a.id}/termino/aprobar`)).status()).toBe(403);
    // Un abogado no tiene el permiso.
    expect((await request.post(`${API}/atenciones/${a.id}/termino/aprobar`, { headers: devUser("ABOGADO", "abogado-vb") })).status()).toBe(403);

    const ok = await request.post(`${API}/atenciones/${a.id}/termino/aprobar`, { headers: devUser("GERENCIA_SERVICIOS", "gerencia-vb") });
    expect(ok.status(), await ok.text()).toBe(201);
    expect(await ok.json()).toMatchObject({ estado: "Terminada", solicitudTermino: null });
  });
});
