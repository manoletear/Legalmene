import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

// PDF mínimo válido para la prueba.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test.describe("Documentos de la atención", () => {
  test("se sube un PDF desde la ficha y aparece en la pestaña Documentos", async ({ page, request }) => {
    const lista = await request.get(`${API}/atenciones?pageSize=5&tipo=Juicio`).then((r) => r.json());
    const atencion = lista.data[0];
    await page.goto(`/atenciones/${atencion.id}`);
    const nombre = `escrito-e2e-${Date.now()}.pdf`;
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({ name: nombre, mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByText("Documento subido").first()).toBeVisible();
    await expect(page.getByText(nombre).first()).toBeVisible();
  });

  test("la API rechaza archivos que no son PDF", async ({ request }) => {
    const r = await request.post(`${API}/documentos/upload-url`, {
      data: { nombre: "foto.png", mimeType: "image/png", tamanoBytes: 10 },
    });
    expect(r.status()).toBe(400);
  });
});
