import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

test.describe("Atenciones flow", () => {
  test("crea consulta, genera correlativo, aparece en lista", async ({ page, request }) => {
    const afi = await request.get(`${API}/afiliados`).then((r) => r.json());
    type AfiliadoE2E = { rut: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };
    const activo = (afi.data as AfiliadoE2E[]).find(
      (a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente),
    );
    expect(activo, "Debe existir al menos 1 afiliado con plan vigente").toBeTruthy();
    const planVigente = activo!.planes.find((p) => p.vigente)!.codPlan;

    await page.goto("/atenciones/nueva");

    // PrimeNG p-select: click trigger then click option in overlay (appendTo=body).
    await page.locator("p-select[formcontrolname='tipo']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Consulta" }).click();

    // El afiliado se busca por RUT (sin lista precargada).
    await page.locator("#rutAfiliado").fill(activo!.rut);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByTestId("afiliado-encontrado")).toContainText(activo!.rut);

    // Al elegir el afiliado se carga su plan vigente como plan de la atención.
    await expect(page.locator("p-select[formcontrolname='codPlan']")).toContainText(planVigente);

    await page.locator("p-select[formcontrolname='competenciaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Laboral" }).click();
    // Las materias se filtran por competencia y por tipo de atención.
    await page.locator("p-select[formcontrolname='materiaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Despido injustificado" }).click();

    await page.locator("input[formcontrolname='asunto']").fill("Test E2E - despido");
    await page.locator("textarea[formcontrolname='descripcion']").fill("Caso de prueba E2E");

    await page.getByRole("button", { name: /^Crear$/ }).click();

    await expect(page).toHaveURL(/\/atenciones\/[0-9a-f-]+$/);
    // Correlativo visible en algún punto de la página (h1, h2 o span según diseño).
    await expect(page.locator("text=/CONS-\\d{4}-\\d{6}/").first()).toBeVisible();
    // breadcrumb con el tipo de caso visible (rutaPrincipal("Consulta") → "Consultas").
    await expect(page.locator("text=Consultas").first()).toBeVisible();
    await expect(page.getByText("Despido injustificado").first()).toBeVisible();
  });

  test("búsqueda full-text encuentra atención por palabra parcial", async ({ page }) => {
    await page.goto("/atenciones");
    await page.locator("input[placeholder*='materia']").fill("despido");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await expect(page.locator("table tbody tr").first()).toContainText(/despido/i);
  });

  test("RUT no registrado: alta rápida desde la nueva atención", async ({ page }) => {
    // RUT válido (módulo 11) aleatorio para no chocar con el seed.
    const cuerpo = String(40_000_000 + Math.floor(Math.random() * 9_000_000));
    let suma = 0;
    let mul = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const r = 11 - (suma % 11);
    const rut = `${cuerpo}-${r === 11 ? "0" : r === 10 ? "K" : r}`;

    await page.goto("/atenciones/nueva");
    await page.locator("#rutAfiliado").fill(rut);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByRole("status")).toContainText("no está registrado");
    await page.getByRole("button", { name: "Registrar afiliado" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.locator('input[name="rut"]')).toHaveValue(rut);
    await dlg.locator('input[name="nombres"]').fill("Alta");
    await dlg.locator('input[name="apellidoPaterno"]').fill("Rapida");
    await dlg.getByRole("button", { name: "Crear afiliado" }).click();
    await expect(page.getByTestId("afiliado-encontrado")).toContainText("Alta Rapida");
    // Sin planes vigentes la atención va como Rezagado.
    await expect(page.locator("p-select[formcontrolname='codPlan']")).toContainText("Rezagado");
  });

  test("con varios planes vigentes se preselecciona el de menor copago", async ({ page, request }) => {
    const afi = await request.get(`${API}/afiliados?pageSize=200`).then((r) => r.json());
    type A = { rut: string; planes: { codPlan: string; vigente: boolean }[] };
    const multi = (afi.data as A[]).find((a) => a.planes.filter((p) => p.vigente).length > 1);
    test.skip(!multi, "El seed no tiene un RUT con varios planes vigentes");
    const comps = await request.get(`${API}/maestros/competencias`).then((r) => r.json());
    const laboral = comps.find((c: { nombre: string }) => c.nombre === "Laboral");
    const mats = await request.get(`${API}/maestros/materias?competenciaId=${laboral.id}&aplicaA=Juicio`).then((r) => r.json());
    const materia = mats.find((m: { nombre: string }) => m.nombre === "Cobro de prestaciones");
    const copagos = await Promise.all(
      multi!.planes
        .filter((p) => p.vigente)
        .map(async (p) => {
          const c = await request
            .get(`${API}/copago?codPlan=${p.codPlan}&materiaId=${materia.id}&tipo=Juicio`)
            .then((r) => r.json());
          expect(c).toHaveProperty("copagoUfCentesimas");
          return { codPlan: p.codPlan, copago: c.copagoUfCentesimas as number | null };
        }),
    );
    const conValor = copagos.filter((c) => c.copago !== null) as { codPlan: string; copago: number }[];
    test.skip(conValor.length < 2, "La materia no tiene arancel");
    const mejor = conValor.reduce((a, b) => (b.copago < a.copago ? b : a));
    // Para que la prueba distinga, el plan más conveniente no debe ser el primero de la lista.
    expect(mejor.codPlan, "el seed debe tener el plan más barato en segundo lugar").not.toBe(multi!.planes.find((p) => p.vigente)!.codPlan);

    await page.goto("/atenciones/nueva");
    await page.locator("p-select[formcontrolname='tipo']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Juicio" }).click();
    await page.locator("#rutAfiliado").fill(multi!.rut);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByTestId("afiliado-encontrado")).toBeVisible();
    await page.locator("p-select[formcontrolname='competenciaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Laboral" }).click();
    await page.locator("p-select[formcontrolname='materiaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Cobro de prestaciones" }).click();
    await expect(page.locator("p-select[formcontrolname='codPlan']")).toContainText(mejor.codPlan);
  });

  test("el tramitador asigna el abogado al crear la atención", async ({ page, request }) => {
    const afi = await request.get(`${API}/afiliados?pageSize=200`).then((r) => r.json());
    type A = { rut: string; vigencia: string; planes: { vigente: boolean }[] };
    const activo = (afi.data as A[]).find((a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente))!;
    const opciones = await request.get(`${API}/usuarios/opciones`).then((r) => r.json());
    const abogado = opciones.find((u: { perfilCodigo: string }) => u.perfilCodigo === "ABOGADO") ?? opciones[0];

    await page.goto("/atenciones/nueva");
    await page.locator("#rutAfiliado").fill(activo.rut);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByTestId("afiliado-encontrado")).toBeVisible();
    await page.locator("p-select[formcontrolname='competenciaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Laboral" }).click();
    await page.locator("p-select[formcontrolname='materiaId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: "Despido injustificado" }).click();
    await page.locator("p-select[formcontrolname='abogadoAsignadoId']").click();
    await page.locator(".p-select-overlay .p-select-option", { hasText: abogado.email }).click();
    await page.locator("input[formcontrolname='asunto']").fill("Asignada por tramitador E2E");
    await page.getByRole("button", { name: /^Crear$/ }).click();

    await expect(page).toHaveURL(/\/atenciones\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;
    const creada = await request.get(`${API}/atenciones/${id}`).then((r) => r.json());
    expect(creada.abogadoAsignadoId).toBe(abogado.id);
  });
});
