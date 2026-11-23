import { expect, test } from "@playwright/test";

// Login con enlace de acceso. En E2E la API corre en modo demo (AUTH_DISABLED): el enlace
// se muestra en pantalla en vez de enviarse por correo.
test.describe("Login con enlace de acceso", () => {
  test("pide el enlace, lo canjea, entra al dashboard y cierra sesión", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("aside.lm-sidebar")).toHaveCount(0);
    await page.getByLabel("Correo electrónico").fill("admin@legalchile.cl");
    await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
    await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();

    await page.getByRole("link", { name: "Abrir enlace de acceso" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("aside.lm-sidebar")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("lm.sesion"))).toContain("token");

    await page.locator(".lm-user-chip").click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem("lm.sesion"))).toBeNull();
  });

  test("un enlace inválido muestra el error y permite pedir otro", async ({ page }) => {
    await page.goto("/login/verificar?token=token-que-no-existe-en-la-base");
    await expect(page.getByRole("heading", { name: "No pudimos validar el enlace" })).toBeVisible();
    await expect(page.getByText("ya fue usado o venció")).toBeVisible();
    await page.getByRole("link", { name: "Solicitar un enlace nuevo" }).click();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  });
});
