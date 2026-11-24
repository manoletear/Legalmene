import { expect, test, type Page } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

async function responderPrompt(page: Page, texto: string) {
  const dlg = page.getByRole("dialog").last();
  await dlg.locator("textarea, input").first().fill(texto);
  await dlg.getByRole("button", { name: "Aceptar" }).click();
}

test.describe("Agenda", () => {
  test("se agenda una audiencia en el calendario, aparece en el día y se cancela", async ({ page }) => {
    const titulo = `Audiencia E2E ${Date.now()}`;
    // Un día distinto en cada corrida (2031–2040) para no chocar con citas de corridas anteriores.
    const anio = 2031 + Math.floor(Math.random() * 10);
    const dia = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
    const fecha = `${anio}-05-${dia}`;
    await page.goto(`/agenda?fecha=${fecha}`);
    await expect(page.getByTestId("mes")).toHaveText(new RegExp(`mayo ${anio}`, "i"));
    await page.getByRole("button", { name: "Agendar" }).click();
    const dlg = page.getByRole("dialog", { name: "Agendar cita" });
    await dlg.locator("p-select[name='tipo']").click();
    await page.getByRole("option", { name: "Audiencia" }).click();
    await dlg.locator("input[name='titulo']").fill(titulo);
    await dlg.locator("input[name='fecha']").fill(fecha);
    await dlg.locator("input[name='horaInicio']").fill("10:00");
    await dlg.locator("input[name='horaFin']").fill("11:00");
    await dlg.getByRole("button", { name: "Agendar" }).click();
    await expect(dlg).toBeHidden();

    await expect(page.locator(`.lm-dia[data-fecha='${fecha}']`)).toContainText(titulo);
    const fila = page.getByTestId("cita-dia").filter({ hasText: titulo });
    await expect(fila).toContainText("Programada");

    // Un tope con la misma hora se rechaza.
    await page.getByRole("button", { name: "Agendar" }).click();
    await dlg.locator("input[name='titulo']").fill("Otra cosa");
    await dlg.locator("input[name='fecha']").fill(fecha);
    await dlg.locator("input[name='horaInicio']").fill("10:30");
    await dlg.locator("input[name='horaFin']").fill("11:30");
    await dlg.getByRole("button", { name: "Agendar" }).click();
    await expect(dlg.getByRole("alert")).toContainText("ya tiene");
    await dlg.getByRole("button", { name: "Cancelar" }).click();

    await fila.getByRole("button", { name: "Cancelar" }).click();
    await expect(fila).toContainText("Cancelada");

    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
    expect(descarga.suggestedFilename()).toBe(`agenda-${anio}-05.xlsx`);
  });
});

test.describe("Comité como bitácora", () => {
  test("los compromisos se registran y se validan en el comité siguiente", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Comité E2E ${Date.now()}`);
    await page.goto(`/atenciones/${a.id}`);
    await page.getByRole("tab", { name: "Comité" }).click();

    await page.getByRole("button", { name: "Convocar comité" }).click();
    await responderPrompt(page, "Revisión de estrategia");
    const primero = page.locator("section.lm-comite").first();
    await expect(primero).toContainText("Revisión de estrategia");

    await primero.locator("input[name='descripcion']").fill("Presentar escrito de téngase presente");
    await primero.locator("input[name='fechaCompromiso']").fill("2031-01-15");
    await primero.getByRole("button", { name: "Agregar" }).click();
    await expect(primero.getByTestId("compromiso")).toContainText("Presentar escrito");

    await primero.locator("p-select").first().click();
    await page.getByRole("option", { name: "Aprobado" }).click();
    await primero.getByRole("button", { name: "Cerrar comité" }).click();
    await responderPrompt(page, "Se aprueba la estrategia");
    await expect(primero).toContainText("Cerrado");

    // Segundo comité: el compromiso anterior se valida aquí.
    await page.getByRole("button", { name: "Convocar comité" }).click();
    await responderPrompt(page, "Seguimiento");
    const segundo = page.locator("section.lm-comite", { hasText: "Seguimiento" });
    const anterior = segundo.getByTestId("compromiso-anterior");
    await expect(anterior).toContainText("Pendiente");
    await anterior.getByRole("button", { name: "Cumplido", exact: true }).click();
    await responderPrompt(page, "Presentado el lunes");
    await expect(anterior).toContainText("Cumplido");

    const comites = await request.get(`${API}/atenciones/${a.id}/comites`).then((r) => r.json());
    expect(comites).toHaveLength(2);
  });
});
