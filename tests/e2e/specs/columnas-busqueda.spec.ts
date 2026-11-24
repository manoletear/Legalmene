import { expect, test } from "@playwright/test";
import { crearAsesoria } from "./fixtures";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Columnas de las búsquedas de atenciones", () => {
  test("asesorías muestran afiliado, abogado, organismo y los bienes cubiertos del plan", async ({ page, request }) => {
    const a = await crearAsesoria(request, `Columnas E2E ${Date.now()}`);
    const at = await request.get(`${API}/atenciones/${a.id}`).then((r) => r.json());
    const identificador = `ROL-${Date.now()}`;
    const csv = `rut_titular,tipo,identificador,descripcion\n${at.afiliado.rut},Inmueble,${identificador},Casa E2E\n`;
    const carga = await request.post(`${API}/cargas-masivas/bienes?codPlan=${at.codPlan}&tipo=FLUJO`, {
      multipart: { archivo: { name: "bienes.csv", mimeType: "text/csv", buffer: Buffer.from(csv) } },
    });
    expect((await carga.json()).insertados).toBe(1);

    const busqueda = await request.get(`${API}/atenciones?correlativo=${a.correlativo}&tipo=Asesoria`).then((r) => r.json());
    expect(busqueda.data[0].bienes).toContain(identificador.toUpperCase());
    expect(busqueda.data[0].afiliadoRut).toBe(at.afiliado.rut);

    await page.goto("/asesorias");
    await page.locator("input[name='correlativo']").fill(a.correlativo);
    await page.getByRole("button", { name: "Buscar" }).click();
    const encabezado = page.locator("thead tr").first();
    for (const col of ["Afiliado", "Plan / canal", "Abogado", "Término", "Organismo", "Bienes"]) {
      await expect(encabezado.getByText(col, { exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("bienes").first()).toContainText(identificador.toUpperCase());
  });
});
