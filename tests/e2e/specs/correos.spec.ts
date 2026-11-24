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
});
