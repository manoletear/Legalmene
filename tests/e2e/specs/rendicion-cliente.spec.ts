import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Rendición de fondos al cliente", () => {
  test("rendir cliente, cheque por el saldo, comprobante de 3 copias y rendido a cliente", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Rendición E2E ${Date.now()}`);
    // Provisión pagada por el cliente y no entregada: todo el monto vuelve al cliente.
    const prov = await request.post(`${API}/atenciones/${a.id}/provisiones`, { data: { monto: 120_000, motivo: "Peritaje E2E" } }).then((r) => r.json());
    expect((await request.post(`${API}/provisiones/${prov.id}/pago-cliente`, { data: { medio: "Transferencia", referencia: "TRF-E2E" } })).ok()).toBeTruthy();

    await page.goto(`/atenciones/${a.id}`);
    await expect(page.getByTestId("saldo-cuenta")).toContainText("120.000");
    const bloque = page.getByTestId("rendicion-cliente");
    await bloque.getByRole("button", { name: "Rendir cliente" }).click();
    await expect(bloque).toContainText("Rendición solicitada");

    await bloque.getByRole("button", { name: "Cheque devolución" }).click();
    await page.getByRole("dialog").locator("input, textarea").first().fill("CH-E2E-1");
    await page.getByRole("button", { name: "Aceptar" }).click();
    await expect(bloque).toContainText("Cheque de devolución disponible");
    await expect(bloque).toContainText("CH-E2E-1");
    await expect(page.getByTestId("saldo-cuenta")).toContainText("$ 0");

    const pdf = await request.get(`${API}/exports/comprobantes/rendicion/${a.id}.pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(3);

    await bloque.getByRole("button", { name: "Rendido a cliente" }).click();
    await expect(bloque.getByRole("button", { name: "Rendido a cliente" })).toHaveCount(0);
    await expect(bloque.locator("strong")).toHaveText("Rendido a cliente");
    const lista = await request.get(`${API}/atenciones/${a.id}/provisiones`).then((r) => r.json());
    expect(lista.data[0].estado).toBe("RendidaCliente");
  });
});

test.describe("Registro de pagos del cliente", () => {
  test("el pago de una provisión se registra con medio, cuotas y referencia desde Provisiones", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Pago E2E ${Date.now()}`);
    const prov = await request.post(`${API}/atenciones/${a.id}/provisiones`, { data: { monto: 80_000, motivo: "Receptor E2E" } }).then((r) => r.json());

    await page.goto("/provisiones");
    await page.locator("input[name='correlativo']").fill(a.correlativo);
    await page.getByRole("button", { name: "Buscar" }).click();
    const fila = page.locator("tr", { hasText: a.correlativo });
    await fila.getByRole("button", { name: "Registrar pago del cliente" }).click();

    const dlg = page.getByRole("dialog");
    await dlg.locator("p-select[name='medio']").click();
    await page.getByRole("option", { name: "Transferencia bancaria" }).click();
    // Una transferencia exige la referencia.
    await expect(dlg.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
    await dlg.locator("input[name='referencia']").fill("TRF-UI-777");
    await dlg.getByRole("button", { name: "Registrar pago" }).click();
    await expect(fila).toContainText("Pagada por cliente");

    const lista = await request.get(`${API}/atenciones/${a.id}/provisiones`).then((r) => r.json());
    const p = lista.data.find((x: { id: string }) => x.id === prov.id);
    expect(p).toMatchObject({ estado: "Pagada", medioPagoCliente: "Transferencia", referenciaPagoCliente: "TRF-UI-777" });
  });
});

test.describe("Cuenta corriente por abogado", () => {
  test("muestra lo autorizado por entregar de cada abogado", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Cta Cte E2E ${Date.now()}`);
    const prov = await request.post(`${API}/atenciones/${a.id}/provisiones`, { data: { monto: 70_000, motivo: "Notario E2E" } }).then((r) => r.json());
    const post = (accion: string, data: object = {}, headers: Record<string, string> = {}) =>
      request.post(`${API}/provisiones/${prov.id}/${accion}`, { data, headers });
    expect((await post("pago-cliente", { medio: "CasaCentral" })).ok()).toBeTruthy();
    expect((await post("solicitar-entrega")).ok()).toBeTruthy();
    // Cuatro ojos: autoriza otro usuario.
    const claims = { entraOid: "dev-jefe-ctacte", email: "jefe-ctacte@test.cl", nombre: "Jefe Cta Cte", perfil: "GERENCIA_SERVICIOS" };
    const jefe = { "X-Dev-User": Buffer.from(JSON.stringify(claims)).toString("base64") };
    expect((await post("autorizar", {}, jefe)).ok()).toBeTruthy();

    const cuentas = await request.get(`${API}/provisiones/cuenta-corriente`).then((r) => r.json());
    const mia = cuentas.find((c: { provisiones: { id: string }[] }) => c.provisiones.some((p) => p.id === prov.id));
    expect(mia.porEntregar).toBeGreaterThanOrEqual(70_000);

    await page.goto("/cuenta-corriente");
    await page.getByRole("button", { name: `Detalle de ${mia.abogadoNombre}` }).click();
    await expect(page.getByText(a.correlativo).first()).toBeVisible();
    await expect(page.locator("tr", { hasText: a.correlativo }).last()).toContainText("Entrega autorizada");
  });
});
