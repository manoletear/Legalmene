import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Feriados", () => {
  test("los legales del año se cargan solos y se puede agregar uno por decreto", async ({ page, request }) => {
    const anio = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date()).slice(0, 4)) + 1;
    const lista: { fecha: string; nombre: string }[] = await request.get(`${API}/feriados?anio=${anio}`).then((r) => r.json());
    expect(lista.map((f) => f.fecha)).toEqual(expect.arrayContaining([`${anio}-01-01`, `${anio}-09-18`, `${anio}-12-25`]));

    // Una fecha libre del año siguiente (ni feriado ni usada por otra corrida).
    const usadas = new Set(lista.map((f) => f.fecha));
    let fecha = "";
    for (let d = 2; d < 360 && !fecha; d++) {
      const f = new Date(Date.UTC(anio, 0, 1 + d)).toISOString().slice(0, 10);
      if (!usadas.has(f)) fecha = f;
    }

    await page.goto("/admin/maestros");
    await page.getByRole("tab", { name: "Feriados" }).click();
    await page.locator("input[name='fechaFeriado']").fill(fecha);
    const nombre = `Feriado E2E ${Date.now()}`;
    await page.locator("input[name='nombreFeriado']").fill(nombre);
    await page.getByRole("button", { name: "Agregar feriado" }).click();
    await expect(page.getByText("Feriado agregado").first()).toBeVisible();
    const fila = page.locator("tr", { hasText: nombre });
    await expect(fila).toContainText("Agregado");

    const despues: { fecha: string; origen: string }[] = await request.get(`${API}/feriados?anio=${anio}`).then((r) => r.json());
    expect(despues.find((f) => f.fecha === fecha)?.origen).toBe("Manual");
    // Repetir la fecha responde 409.
    expect((await request.post(`${API}/feriados`, { data: { fecha, nombre: "Otro" } })).status()).toBe(409);
  });
});
