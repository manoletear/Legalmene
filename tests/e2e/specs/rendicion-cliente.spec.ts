import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Rendición de fondos al cliente", () => {
  test("rendir cliente, cheque por el saldo, comprobante de 3 copias y rendido a cliente", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Rendición E2E ${Date.now()}`);
    // Provisión pagada por el cliente y no entregada: todo el monto vuelve al cliente.
    const prov = await request.post(`${API}/atenciones/${a.id}/provisiones`, { data: { monto: 120_000, motivo: "Peritaje E2E" } }).then((r) => r.json());
    expect((await request.post(`${API}/provisiones/${prov.id}/pago-cliente`, { data: { medio: "Transferencia" } })).ok()).toBeTruthy();

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
