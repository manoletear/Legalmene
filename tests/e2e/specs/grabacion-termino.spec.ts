import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Código de grabación y fecha de término", () => {
  test("una asesoría guarda su código de grabación desde la ficha", async ({ page, request }) => {
    const a = await crearAsesoria(request, `E2E ${Date.now()}`);
    // Sin pago del arancel no hay comprobante: 409 en JSON, no un PDF.
    const sinPago = await request.get(`${API}/exports/comprobantes/arancel/${a.id}.pdf`);
    expect(sinPago.status()).toBe(409);
    expect(sinPago.headers()["content-type"]).toContain("application/json");
    await page.goto(`/atenciones/${a.id}`);
    const codigo = `GRAB-E2E-${Date.now()}`;
    await page.locator("#grabacionCaso").fill(codigo);
    await page.getByRole("button", { name: "Guardar datos" }).click();
    await expect(page.getByText("Datos guardados").first()).toBeVisible();
    const despues = await request.get(`${API}/atenciones/${a.id}`).then((r) => r.json());
    expect(despues.codigoGrabacion).toBe(codigo);
  });

  test("al elegir Abandonada o Terminada se pide la fecha de término (hoy por defecto)", async ({ page, request }) => {
    const lista = await request.get(`${API}/atenciones?pageSize=20&tipo=Juicio`).then((r) => r.json());
    const a = lista.data.find((x: { estado: string }) => !["Terminada", "Abandonada"].includes(x.estado));
    test.skip(!a, "sin juicios abiertos en el seed");
    await page.goto(`/atenciones/${a.id}`);
    await expect(page.locator("#fechaTerminoEstado")).toHaveCount(0);
    await page.getByTestId("estado-destino").click();
    const opcion = page.getByRole("option", { name: /Abandonada|Terminada/ }).first();
    test.skip(!(await opcion.count()), "el juicio no puede cerrarse desde su estado actual");
    await opcion.click();
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    await expect(page.locator("#fechaTerminoEstado")).toHaveValue(hoy);
    await expect(page.locator("#fechaTerminoEstado")).toHaveAttribute("max", hoy);
  });

  test("la API rechaza una fecha de término futura", async ({ request }) => {
    const lista = await request.get(`${API}/atenciones?pageSize=20&tipo=Juicio`).then((r) => r.json());
    const a = lista.data.find((x: { estado: string }) => !["Terminada", "Abandonada"].includes(x.estado));
    test.skip(!a, "sin juicios abiertos en el seed");
    const futura = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const r = await request.post(`${API}/atenciones/${a.id}/estado`, { data: { estado: "Abandonada", fechaTermino: futura } });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/futura/);
  });
});
