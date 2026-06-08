import { expect, test } from "@playwright/test";

test.describe("Cargas masivas", () => {
  test("procesa CSV FLUJO y muestra resultado con errores", async ({ page }) => {
    await page.goto("/cargas-masivas");

    // 2 válidos + 1 RUT con DV deliberadamente incorrecto (12345678 → DV correcto es 5, no 9).
    const csv =
      "rut,nombres,apellido_paterno,apellido_materno,email\n" +
      "33333333-3,Pedro,E2E,Test,pedro.e2e@test.cl\n" +
      "44444444-4,Ana,E2E,Test,ana.e2e@test.cl\n" +
      "12345678-9,Mal,Rut,,bad@test.cl\n";

    await page.setInputFiles("input[type='file']", {
      name: "demo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    await page.getByRole("button", { name: /Procesar carga/ }).click();

    // Espera el resultado (KPI cards aparecen tras post).
    await expect(page.locator("small", { hasText: "Total filas" })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("small", { hasText: "Insertados" })).toBeVisible();
    await expect(page.locator("h4", { hasText: "Errores" })).toBeVisible();

    // Al menos 1 error con texto "RUT inv" en la tabla de errores.
    await expect(page.locator("table td", { hasText: /RUT inv/i }).first()).toBeVisible();
  });
});
