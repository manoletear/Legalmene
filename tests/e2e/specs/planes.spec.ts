import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Administración de planes", () => {
  test("se crea un plan copiando coberturas, se le pone término y deja de ser vigente", async ({ page, request }) => {
    const cod = `E2E${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
    await page.goto("/admin/planes");
    await page.getByRole("button", { name: "Nuevo plan" }).click();
    const dlg = page.getByRole("dialog", { name: "Nuevo plan" });
    await dlg.locator('input[name="codPlan"]').fill(cod.toLowerCase());
    await dlg.locator('input[name="nombre"]').fill("Plan E2E");
    await dlg.locator("p-select[name='copiarDe']").click();
    await page.getByRole("option", { name: /^DEMO —/ }).click();
    await dlg.getByRole("button", { name: "Crear plan" }).click();
    await expect(page.getByText(/reglas de cobertura copiadas de DEMO/).first()).toBeVisible();

    const planes = await request.get(`${API}/planes`).then((r) => r.json());
    const demo = planes.find((p: { codPlan: string }) => p.codPlan === "DEMO");
    const nuevo = planes.find((p: { codPlan: string }) => p.codPlan === cod);
    expect(nuevo).toMatchObject({ vigenteHoy: true, coberturas: demo.coberturas, fechaTermino: null });

    // Término de vigencia en el pasado: el plan queda "Término vencido".
    const fila = page.locator("tr", { hasText: cod });
    await fila.getByRole("button", { name: "Editar" }).click();
    const ayer = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    await page.getByRole("dialog").locator('input[name="fechaTermino"]').fill(ayer);
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
    await expect(fila.getByText("Término vencido")).toBeVisible();
    const despues = await request.get(`${API}/planes`).then((r) => r.json());
    expect(despues.find((p: { codPlan: string }) => p.codPlan === cod)).toMatchObject({ vigenteHoy: false, fechaTermino: ayer });
  });

  test("la API valida el código del plan y no permite cambiarlo", async ({ request }) => {
    expect((await request.post(`${API}/planes`, { data: { codPlan: "con espacio", nombre: "X" } })).status()).toBe(400);
    const r = await request.patch(`${API}/planes/DEMO`, { data: { codPlan: "OTRO" } });
    // codPlan no es parte del esquema de edición: se ignora y el plan sigue siendo DEMO.
    expect(r.status()).toBe(200);
    expect((await r.json()).codPlan).toBe("DEMO");
    expect((await request.get(`${API}/planes/OTRO`)).status()).toBe(404);
  });
});
