import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

function asUser(rol: string) {
  const claims = {
    entraOid: `dev-${rol.toLowerCase()}`,
    email: `${rol.toLowerCase()}@test.cl`,
    nombre: rol,
    rol,
    codPlanes: [],
  };
  return { "X-Dev-User": Buffer.from(JSON.stringify(claims), "utf-8").toString("base64") };
}

test.describe("Maestros y coberturas", () => {
  test("cualquier usuario lee maestros; solo Administrador los crea y edita", async ({ request }) => {
    const abogado = asUser("Abogado");
    const admin = asUser("Administrador");

    const competencias = await request.get(`${API}/maestros/competencias?vigente=true`, { headers: abogado });
    expect(competencias.ok()).toBeTruthy();
    const laboral = (await competencias.json()).find((c: { nombre: string }) => c.nombre === "Laboral");
    expect(laboral, "El seed debe incluir la competencia Laboral").toBeTruthy();

    const nombre = `Materia E2E ${Date.now()}`;
    const denegado = await request.post(`${API}/maestros/materias`, {
      headers: abogado,
      data: { competenciaId: laboral.id, nombre },
    });
    expect(denegado.status()).toBe(403);

    const creada = await request.post(`${API}/maestros/materias`, {
      headers: admin,
      data: { competenciaId: laboral.id, nombre, aplicaJuicio: false },
    });
    expect(creada.ok()).toBeTruthy();
    const materia = await creada.json();

    const duplicada = await request.post(`${API}/maestros/materias`, {
      headers: admin,
      data: { competenciaId: laboral.id, nombre },
    });
    expect(duplicada.status()).toBe(409);

    // No aplica a juicios: no aparece al filtrar por ese tipo.
    const paraJuicio = await request
      .get(`${API}/maestros/materias?competenciaId=${laboral.id}&aplicaA=Juicio`, { headers: abogado })
      .then((r) => r.json());
    expect(paraJuicio.some((m: { id: string }) => m.id === materia.id)).toBe(false);

    const desactivada = await request.put(`${API}/maestros/materias/${materia.id}`, {
      headers: admin,
      data: { vigente: false },
    });
    expect((await desactivada.json()).vigente).toBe(false);

    const noExiste = await request.get(`${API}/maestros/no-existe`, { headers: abogado });
    expect(noExiste.status()).toBe(404);
  });

  test("copago según la cobertura del plan DEMO", async ({ request }) => {
    const headers = asUser("Abogado");
    const comps = await request.get(`${API}/maestros/competencias`, { headers }).then((r) => r.json());
    const laboral = comps.find((c: { nombre: string }) => c.nombre === "Laboral");
    const materias = await request.get(`${API}/maestros/materias?competenciaId=${laboral.id}`, { headers }).then((r) => r.json());
    const despido = materias.find((m: { nombre: string }) => m.nombre === "Despido injustificado");

    // DEMO cubre el 80 % del juicio por despido (arancel 12 UF): copago 2,4 UF.
    const r = await request.get(`${API}/copago?codPlan=DEMO&materiaId=${despido.id}&tipo=Juicio`, { headers });
    expect(r.ok()).toBeTruthy();
    const c = await r.json();
    expect(c.arancel.codigo).toBe("A-LAB-01");
    expect(c.cobertura.porcentaje).toBe(80);
    expect(c.copagoUfCentesimas).toBe(240);

    const crear = await request.post(`${API}/coberturas`, {
      headers,
      data: { codPlan: "DEMO", modalidad: "SinCobertura" },
    });
    expect(crear.status()).toBe(403);
  });

  test("la página de maestros muestra el catálogo y la de coberturas las reglas del plan", async ({ page }) => {
    await page.goto("/admin/maestros");
    await expect(page.getByText("Laboral", { exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Materias" }).click();
    await expect(page.getByText("Despido injustificado").first()).toBeVisible();

    await page.goto("/admin/coberturas?plan=DEMO");
    await expect(page.getByText("Todas (regla general)").first()).toBeVisible();
    await expect(page.getByText("80% del arancel")).toBeVisible();
  });
});
