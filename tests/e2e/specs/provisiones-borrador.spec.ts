import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Provisiones en borrador", () => {
  test("se ingresan varias como borrador y se notifican las elegidas", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Borradores E2E ${Date.now()}`);
    await page.goto(`/atenciones/${a.id}`);
    for (const [monto, motivo] of [["15000", "Receptor judicial"], ["8000", "Copias autorizadas"]]) {
      await page.getByText("Solicitar provisión", { exact: true }).click();
      const dlg = page.getByTestId("nueva-provision");
      await dlg.locator("input[name='npMonto']").fill(monto);
      await dlg.locator("textarea[name='npMotivo']").fill(motivo);
      await dlg.locator("input[name='npBorrador']").check();
      await dlg.getByRole("button", { name: "Guardar borrador" }).click();
      await expect(page.getByText("Borrador guardado", { exact: true }).first()).toBeVisible();
    }
    const caja = page.getByTestId("borradores-provision");
    await caja.getByLabel("Receptor judicial").check();
    await caja.getByRole("button", { name: "Notificar seleccionadas" }).click();
    await expect(page.getByText("1 provisión(es) notificada(s)")).toBeVisible();
    await expect(caja).not.toContainText("Receptor judicial");
    await expect(caja).toContainText("Copias autorizadas");
    const r = await request.get(`${API}/atenciones/${a.id}/provisiones`).then((x) => x.json());
    expect(r.data.map((p: { estado: string }) => p.estado).sort()).toEqual(["Borrador", "Solicitada"]);
  });
});
