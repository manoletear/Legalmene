import { expect, test, type APIRequestContext } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

function rutAleatorio(): string {
  const cuerpo = String(50_000_000 + Math.floor(Math.random() * 9_000_000));
  let suma = 0;
  let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (suma % 11);
  return `${cuerpo}-${r === 11 ? "0" : r === 10 ? "K" : r}`;
}

const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

// Juicio por despido en DEMO (copago 2,4 UF) para un afiliado nuevo con correo.
async function juicioDemo(request: APIRequestContext) {
  const afi = await request
    .post(`${API}/afiliados`, { data: { rut: rutAleatorio(), nombres: "Webpay", apellidoPaterno: "E2E", email: `webpay.${Date.now()}@example.com` } })
    .then((r) => r.json());
  expect((await request.post(`${API}/afiliados/${afi.id}/planes`, { data: { codPlan: "DEMO", fechaInicio: "2024-01-01" } })).ok()).toBeTruthy();
  const laboral = (await request.get(`${API}/maestros/competencias`).then((r) => r.json())).find((c: { nombre: string }) => c.nombre === "Laboral");
  const despido = (await request.get(`${API}/maestros/materias?competenciaId=${laboral.id}&aplicaA=Juicio&vigente=true`).then((r) => r.json())).find(
    (m: { nombre: string }) => m.nombre === "Despido injustificado",
  );
  const juicio = await request
    .post(`${API}/atenciones/juicios`, { data: { afiliadoId: afi.id, codPlan: "DEMO", competenciaId: laboral.id, materiaId: despido.id, asunto: `E2E WebPay ${Date.now()}` } })
    .then((r) => r.json());
  return { juicio, materiaId: despido.id as string };
}

test.describe("Arancel por WebPay, decisión de provisión y campos adicionales", () => {
  test("Notificar pago envía la orden y el pago WebPay deja el arancel pagado", async ({ page, request }) => {
    const hoy = hoyChile();
    const vigente = await request.get(`${API}/valores-uf/vigente?fecha=${hoy}`);
    if (!vigente.ok() || (await vigente.json())?.fecha !== hoy) {
      expect((await request.put(`${API}/valores-uf`, { data: { fecha: hoy, valorCentavos: 3_900_000 } })).ok()).toBeTruthy();
    }
    const { juicio } = await juicioDemo(request);

    await page.goto(`/atenciones/${juicio.id}`);
    await page.getByTestId("notificar-pago").click();
    await expect(page.getByText("Pago notificado")).toBeVisible();
    await expect(page.getByTestId("arancel-camino")).toContainText("WebPay");

    const ar = await request.get(`${API}/atenciones/${juicio.id}/arancel`).then((r) => r.json());
    expect(ar.caminoPago).toBe("WebPay");
    expect((await request.post(`${API}/pagos/confirmar`, { data: { ordenCompra: ar.webpayOrdenCompra, authCode: "E2E", exitoso: true } })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("arancel-estado")).toContainText("Pagado");
    await expect(page.getByTestId("notificar-pago")).toHaveCount(0);
  });

  test("la decisión del cliente sobre la provisión se registra desde la ficha", async ({ page, request }) => {
    const { juicio } = await juicioDemo(request);
    await page.goto(`/atenciones/${juicio.id}`);
    const caja = page.getByTestId("decision-provision");
    await expect(caja).toContainText("sin decisión registrada");
    // En un juicio no se ofrece "paga directamente".
    await expect(caja.getByText("Paga directamente los gastos")).toHaveCount(0);
    await caja.getByText("Acepta provisionar", { exact: true }).click();
    await expect(caja.locator("strong")).toHaveText("Acepta provisionar");
  });

  test("un campo adicional de la materia aparece en la ficha y se guarda", async ({ page, request }) => {
    const { juicio, materiaId } = await juicioDemo(request);
    const etiqueta = `Cuantía E2E ${Date.now()}`;
    const campo = await request
      .post(`${API}/campos-adicionales`, { data: { etiqueta, tipoDato: "Numero", obligatorio: true, materiaId, tipoAtencion: "Juicio", orden: 0 } })
      .then((r) => r.json());
    try {
      await page.goto(`/atenciones/${juicio.id}`);
      const caja = page.getByTestId("campos-adicionales");
      await caja.getByLabel(etiqueta).fill("2500");
      await caja.getByRole("button", { name: "Guardar campos" }).click();
      await expect(page.getByText("Campos guardados")).toBeVisible();
      const r = await request.get(`${API}/atenciones/${juicio.id}/campos-adicionales`).then((x) => x.json());
      expect(r.valores[campo.id]).toBe(2500);
    } finally {
      await request.patch(`${API}/campos-adicionales/${campo.id}`, { data: { vigente: false } });
    }
  });

  test("el administrador define las columnas de una exportación", async ({ page, request }) => {
    await page.goto("/admin/formatos-exportacion");
    await page.getByTestId("formato-clave").click();
    await page.getByRole("option", { name: "Pagos WebPay" }).click();
    const formatos = await request.get(`${API}/exports/formatos`).then((r) => r.json());
    const pagos = formatos.find((f: { clave: string }) => f.clave === "pagos");
    // Se quita la primera columna y se guarda.
    await page.getByLabel(pagos.disponibles[0], { exact: true }).click();
    await page.getByTestId("formato-guardar").click();
    await expect(page.getByText("Formato guardado")).toBeVisible();
    const guardado = (await request.get(`${API}/exports/formatos`).then((r) => r.json())).find((f: { clave: string }) => f.clave === "pagos");
    expect(guardado.columnas).toEqual(pagos.disponibles.slice(1));
    expect((await request.delete(`${API}/exports/formatos/pagos`)).ok()).toBeTruthy();
  });
});
