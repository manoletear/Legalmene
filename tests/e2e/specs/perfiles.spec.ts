import { expect, test, type Browser } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

// X-Dev-User con el perfil indicado por código (AUTH_DISABLED en E2E).
function devUser(perfil: string, alias = perfil.toLowerCase()) {
  const claims = { entraOid: `dev-${alias}`, email: `${alias}@test.cl`, nombre: `E2E ${perfil}`, perfil };
  return Buffer.from(JSON.stringify(claims), "utf-8").toString("base64");
}

async function paginaComo(browser: Browser, perfil: string) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Dev-User": devUser(perfil) } });
  return { ctx, page: await ctx.newPage() };
}

test.describe("Perfiles y permisos", () => {
  test("/me entrega perfil y permisos; ADMIN tiene todos", async ({ request }) => {
    const admin = await (await request.get(`${API}/me`, { headers: { "X-Dev-User": devUser("ADMIN") } })).json();
    expect(admin.perfil.codigo).toBe("ADMIN");
    expect(admin.permisos).toContain("perfiles.administrar");
    const abogado = await (await request.get(`${API}/me`, { headers: { "X-Dev-User": devUser("ABOGADO") } })).json();
    expect(abogado.perfil.codigo).toBe("ABOGADO");
    expect(abogado.permisos).not.toContain("usuarios.administrar");
    expect(abogado.permisos).not.toContain("atenciones.ver_todas");
  });

  test("el menú depende del perfil y las rutas sin permiso vuelven al dashboard", async ({ browser }) => {
    const { ctx, page } = await paginaComo(browser, "ABOGADO");
    await page.goto("/dashboard");
    const nav = page.locator("aside.lm-sidebar nav");
    await expect(nav.getByText("Juicios", { exact: true })).toBeVisible();
    await expect(nav.getByText("Usuarios", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Perfiles", { exact: true })).toHaveCount(0);
    await expect(nav.getByText("Auditoría", { exact: true })).toHaveCount(0);
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Sin acceso").first()).toBeVisible();
    await ctx.close();

    const admin = await paginaComo(browser, "ADMIN");
    await admin.page.goto("/admin/perfiles");
    await expect(admin.page.getByRole("heading", { name: "Perfiles y permisos" })).toBeVisible();
    await expect(admin.page.getByText("Jefatura Judicial").first()).toBeVisible();
    await expect(admin.page.getByText("Aprobar o rechazar derivaciones").first()).toBeVisible();
    await admin.ctx.close();
  });

  test("el abogado no ve ni opera atenciones ajenas (404) y una acción sin permiso es 403", async ({ request }) => {
    const admin = { "X-Dev-User": devUser("ADMIN") };
    const abogado = { "X-Dev-User": devUser("ABOGADO", "abogado-perfiles") };

    const afi = await request.get(`${API}/afiliados`, { headers: admin }).then((r) => r.json());
    type AfiliadoE2E = { id: string; vigencia: string; planes: { codPlan: string; vigente: boolean }[] };
    const activo = (afi.data as AfiliadoE2E[]).find((a) => a.vigencia === "Activo" && a.planes.some((p) => p.vigente));
    expect(activo, "Debe existir un afiliado con plan vigente").toBeTruthy();
    const competencias = await request.get(`${API}/maestros/competencias?vigente=true`, { headers: admin }).then((r) => r.json());
    const laboral = competencias.find((c: { nombre: string }) => c.nombre === "Laboral");
    const materias = await request.get(`${API}/maestros/materias?vigente=true&competenciaId=${laboral.id}`, { headers: admin }).then((r) => r.json());
    const materia = materias.find((m: { aplicaConsulta: boolean }) => m.aplicaConsulta);

    const ajena = await request
      .post(`${API}/atenciones/consultas`, {
        headers: admin,
        data: { afiliadoId: activo!.id, codPlan: activo!.planes.find((p) => p.vigente)!.codPlan, competenciaId: laboral.id, materiaId: materia.id, asunto: "E2E ajena" },
      })
      .then((r) => r.json());

    expect((await request.get(`${API}/atenciones/${ajena.id}`, { headers: abogado })).status()).toBe(404);
    expect((await request.get(`${API}/atenciones/${ajena.id}/gestiones`, { headers: abogado })).status()).toBe(404);
    const listado = await request.get(`${API}/atenciones?pageSize=200`, { headers: abogado }).then((r) => r.json());
    expect(listado.data.map((a: { id: string }) => a.id)).not.toContain(ajena.id);
    const estado = await request.post(`${API}/atenciones/${ajena.id}/estado`, { headers: abogado, data: { estado: "Respondida" } });
    expect(estado.status()).toBe(404);

    // Permiso que el perfil no tiene: 403 antes de llegar a la atención.
    const usuarios = await request.get(`${API}/admin/usuarios`, { headers: abogado });
    expect(usuarios.status()).toBe(403);
    expect((await usuarios.json()).message).toContain("Administrar usuarios");
  });
});
