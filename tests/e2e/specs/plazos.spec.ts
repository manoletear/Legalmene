import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Plazos de la atención", () => {
  test("la ficha muestra el plazo de contacto y se cumple al registrar el contacto", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Plazos E2E ${Date.now()}`);
    const plazos = await request.get(`${API}/atenciones/${a.id}/plazos`).then((r) => r.json());
    expect(plazos[0]).toMatchObject({ tipo: "ContactoCliente", estado: "Pendiente" });

    await page.goto(`/atenciones/${a.id}`);
    const tarjeta = page.getByTestId("plazos");
    await expect(tarjeta).toContainText("Contacto con el cliente");
    await expect(tarjeta).toContainText("Pendiente");
    await tarjeta.getByRole("button", { name: "Registrar contacto con el cliente" }).click();
    await expect(tarjeta).toContainText("Cumplido");
    await expect(tarjeta.getByRole("button", { name: "Registrar contacto con el cliente" })).toHaveCount(0);
  });

  test("una consulta no tiene estos plazos", async ({ request }) => {
    const lista = await request.get(`${API}/atenciones?pageSize=1&tipo=Consulta`).then((r) => r.json());
    expect(await request.get(`${API}/atenciones/${lista.data[0].id}/plazos`).then((r) => r.json())).toEqual([]);
  });
});
