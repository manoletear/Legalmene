import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

// RUT válido (módulo 11) aleatorio, para no chocar con el seed ni entre corridas.
function rutAleatorio(): string {
  const cuerpo = String(30_000_000 + Math.floor(Math.random() * 9_000_000));
  let suma = 0;
  let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (suma % 11);
  const dv = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return `${cuerpo}-${dv}`;
}

test.describe("Afiliados: alta, edición, planes y eliminación desde la web", () => {
  test("se crea, edita, asigna plan, elimina y restaura un afiliado", async ({ page, request }) => {
    const rut = rutAleatorio();
    const planes = await request.get(`${API}/planes`).then((r) => r.json());
    const plan = planes.find((p: { vigencia?: string }) => p.vigencia !== "NoVigente") ?? planes[0];

    await page.goto("/afiliados");
    await page.getByRole("button", { name: "Nuevo afiliado" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator('input[name="rut"]').fill(rut);
    await dlg.locator('input[name="nombres"]').fill("Prueba");
    await dlg.locator('input[name="apellidoPaterno"]').fill("Ete");
    await dlg.getByRole("button", { name: "Crear afiliado" }).click();

    await expect(page).toHaveURL(/\/afiliados\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: /Prueba Ete/ })).toBeVisible();

    // Editar
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByRole("dialog").locator('input[name="telefono"]').fill("+56911112222");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("+56911112222")).toBeVisible();

    // Asignar plan
    await page.getByRole("button", { name: "Asignar plan" }).click();
    const dlgPlan = page.getByRole("dialog", { name: "Asignar plan" });
    await dlgPlan.locator("p-select").click();
    await page.getByRole("option", { name: plan.nombre }).click();
    await dlgPlan.getByRole("button", { name: "Asignar" }).click();
    await expect(page.locator("td", { hasText: plan.codPlan }).first()).toBeVisible();

    // Eliminar y restaurar
    await page.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Eliminado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByText("Activo", { exact: true })).toBeVisible();
  });

  test("el RUT inválido se rechaza antes de llamar a la API", async ({ page }) => {
    await page.goto("/afiliados");
    await page.getByRole("button", { name: "Nuevo afiliado" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator('input[name="rut"]').fill("abc");
    await dlg.locator('input[name="nombres"]').fill("X");
    await dlg.locator('input[name="apellidoPaterno"]').fill("Y");
    await dlg.getByRole("button", { name: "Crear afiliado" }).click();
    await expect(dlg.getByRole("alert")).toContainText("RUT");
  });
});
