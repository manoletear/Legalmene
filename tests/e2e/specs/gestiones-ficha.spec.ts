import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Gestiones desde la ficha", () => {
  test("se crea una gestión con responsable y fechas, y se completa con fecha real de término", async ({ page, request }) => {
    const a = await crearAsesoria(request, `E2E ${Date.now()}`);
    const opciones = await request.get(`${API}/usuarios/opciones`).then((r) => r.json());
    const responsable = opciones.find((u: { perfilCodigo: string }) => u.perfilCodigo === "ABOGADO") ?? opciones[0];
    const titulo = `Entrevista E2E ${Date.now()}`;
    const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(d);
    const inicio = fmt(new Date(Date.now() - 3 * 86_400_000));
    const compromiso = fmt(new Date(Date.now() + 5 * 86_400_000));
    const termino = fmt(new Date(Date.now() - 86_400_000));

    await page.goto(`/atenciones/${a.id}`);
    await page.getByRole("button", { name: "Nueva gestión" }).first().click();
    const dlg = page.getByRole("dialog", { name: "Nueva gestión" });
    await dlg.locator("p-select[name='ngTipo']").click();
    await page.getByRole("option", { name: "Reunión / entrevista" }).click();
    await dlg.locator("input[name='ngTitulo']").fill(titulo);
    await dlg.locator("p-select[name='ngResponsable']").click();
    await page.getByRole("option", { name: new RegExp(responsable.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await dlg.locator("input[name='ngInicio']").fill(inicio);
    await dlg.locator("input[name='ngCompromiso']").fill(compromiso);
    await dlg.getByRole("button", { name: "Crear gestión" }).click();
    await expect(page.getByText("Gestión creada").first()).toBeVisible();

    const fila = page.locator("tr", { hasText: titulo });
    await expect(fila).toContainText(responsable.nombre);
    await fila.getByRole("button", { name: "Completar" }).click();
    const dlgC = page.getByRole("dialog", { name: /Completar/ });
    await dlgC.locator("textarea[name='cgResultado']").fill("Se realizó la entrevista");
    await dlgC.locator("input[name='cgFecha']").fill(termino);
    await dlgC.getByRole("button", { name: "Completar" }).click();
    await expect(page.getByText("Gestión completada").first()).toBeVisible();
    await expect(fila.getByRole("button", { name: "Completar" })).toHaveCount(0);
    await expect(fila).toContainText("Realizada");

    const gs = await request.get(`${API}/atenciones/${a.id}/gestiones`).then((r) => r.json());
    const g = gs.find((x: { titulo: string }) => x.titulo === titulo);
    expect(g).toMatchObject({ tipo: "Reunion", estado: "Completada", responsableId: responsable.id, resultado: "Se realizó la entrevista" });
    expect(fmt(new Date(g.fechaProgramada))).toBe(inicio);
    expect(fmt(new Date(g.fechaEjecucion))).toBe(termino);

    // Completar de nuevo responde 409.
    const otra = await request.put(`${API}/gestiones/${g.id}/completar`, { data: { resultado: "otra vez" } });
    expect(otra.status()).toBe(409);
  });
});
