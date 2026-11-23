import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Administración de usuarios", () => {
  test("se crea un usuario con cargo y perfil, y el cargo se puede editar", async ({ page, request }) => {
    const email = `alta-e2e-${Date.now()}@legalchile.cl`;
    await page.goto("/admin/usuarios");
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    const dlg = page.getByRole("dialog", { name: "Nuevo usuario" });
    await dlg.locator('input[name="email"]').fill(email);
    await dlg.locator('input[name="nombre"]').fill("Usuario Alta E2E");
    await dlg.locator('input[name="cargo"]').fill("Abogado junior");
    await dlg.locator("p-select[name='perfilId']").click();
    await page.getByRole("option", { name: "Abogado", exact: true }).click();
    await dlg.getByRole("button", { name: "Crear usuario" }).click();
    await expect(page.getByText("Usuario creado").first()).toBeVisible();

    const res = await request.get(`${API}/admin/usuarios?q=${encodeURIComponent(email)}`).then((r) => r.json());
    expect(res.data[0]).toMatchObject({ email, cargo: "Abogado junior", perfilCodigo: "ABOGADO", activo: true });

    // Editar el cargo en la grilla.
    await page.getByPlaceholder("Buscar (nombre o email)").fill(email);
    await page.getByPlaceholder("Buscar (nombre o email)").press("Enter");
    const cargo = page.getByRole("textbox", { name: "Cargo" }).first();
    await expect(cargo).toHaveValue("Abogado junior");
    await cargo.fill("Abogado senior");
    await cargo.press("Tab");
    await expect(page.getByText("Usuario Alta E2E actualizado").first()).toBeVisible();
    const res2 = await request.get(`${API}/admin/usuarios?q=${encodeURIComponent(email)}`).then((r) => r.json());
    expect(res2.data[0].cargo).toBe("Abogado senior");
  });

  test("correo duplicado o de otro dominio se rechaza", async ({ request }) => {
    const perfiles = await request.get(`${API}/admin/perfiles`).then((r) => r.json());
    const abogado = perfiles.find((p: { codigo: string }) => p.codigo === "ABOGADO");
    const email = `dup-e2e-${Date.now()}@legalchile.cl`;
    expect((await request.post(`${API}/admin/usuarios`, { data: { email, nombre: "A", perfilId: abogado.id } })).status()).toBe(201);
    expect((await request.post(`${API}/admin/usuarios`, { data: { email, nombre: "B", perfilId: abogado.id } })).status()).toBe(409);
    const ajeno = await request.post(`${API}/admin/usuarios`, { data: { email: "x@ajeno.example", nombre: "C", perfilId: abogado.id } });
    expect(ajeno.status()).toBe(400);
  });
});
