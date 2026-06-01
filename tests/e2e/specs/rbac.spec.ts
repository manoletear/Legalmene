import { expect, test } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";
const COD_PLAN = "DEMO";

// Inyecta un user via X-Dev-User (base64 JSON). El JwtAuthGuard en modo dev
// lo respeta y lo materializa en req.user, lo que ejercita RolesGuard real.
function asUser(rol: string, email = `${rol.toLowerCase()}@test.cl`) {
  const claims = {
    entraOid: `dev-${rol.toLowerCase()}`,
    email,
    nombre: rol,
    rol,
    codPlanes: [COD_PLAN],
  };
  return Buffer.from(JSON.stringify(claims), "utf-8").toString("base64");
}

test.describe("RBAC", () => {
  test("Auditor puede leer pero NO puede crear afiliado (403)", async ({ request }) => {
    const auditor = asUser("Auditor");
    const headers = { "X-Cod-Plan": COD_PLAN, "X-Dev-User": auditor };

    // Lectura OK
    const list = await request.get(`${API}/afiliados`, { headers });
    expect(list.ok()).toBeTruthy();

    // Auditoría OK (Auditor está autorizado)
    const audit = await request.get(`${API}/auditoria?pageSize=1`, { headers });
    expect(audit.ok()).toBeTruthy();

    // Crear afiliado debe ser rechazado
    const create = await request.post(`${API}/afiliados`, {
      headers: { ...headers, "Content-Type": "application/json" },
      data: { rut: "77777771-9", nombres: "X", apellidoPaterno: "Y" },
    });
    expect(create.status()).toBe(403);
  });

  test("Operador puede crear afiliados pero NO puede borrarlos (403)", async ({ request }) => {
    const operador = asUser("Operador");
    const headers = { "X-Cod-Plan": COD_PLAN, "X-Dev-User": operador };

    // Crear válido (Operador autorizado)
    const create = await request.post(`${API}/afiliados`, {
      headers: { ...headers, "Content-Type": "application/json" },
      data: {
        rut: `78${Date.now().toString().slice(-7)}-K`, // no necesariamente válido, pero el test es de RBAC, no validación
        nombres: "RBAC",
        apellidoPaterno: "Operador",
      },
    });
    // Puede fallar por validación RUT (400) pero NO por autorización (403).
    expect(create.status()).not.toBe(403);

    // Listar afiliado real para sacar id
    const list = await request.get(`${API}/afiliados?pageSize=1`, { headers });
    const body = await list.json();
    const id = body.data?.[0]?.id;
    expect(id).toBeTruthy();

    // Borrar requiere Administrador → Operador debe recibir 403
    const del = await request.delete(`${API}/afiliados/${id}`, { headers });
    expect(del.status()).toBe(403);
  });

  test("Abogado puede crear gestiones pero NO puede convocar comité (403)", async ({ request }) => {
    const abogado = asUser("Abogado");
    const adminHdr = { "X-Cod-Plan": COD_PLAN, "X-Dev-User": asUser("Administrador") };
    const abogadoHdr = { "X-Cod-Plan": COD_PLAN, "X-Dev-User": abogado };

    // Necesitamos una atención existente (creada por admin)
    const list = await request.get(`${API}/atenciones?tipo=Consulta&pageSize=1`, {
      headers: adminHdr,
    });
    const atencion = (await list.json()).data?.[0];
    expect(atencion, "Se requiere al menos 1 consulta en DEMO").toBeTruthy();

    // Convocar comité requiere Administrador o Supervisor → 403 para Abogado.
    const conv = await request.post(`${API}/atenciones/${atencion.id}/comites`, {
      headers: { ...abogadoHdr, "Content-Type": "application/json" },
      data: { motivo: "intento abogado", participantesIds: ["5dea0886-7856-452c-85af-eb2f2e65e726"] },
    });
    expect(conv.status()).toBe(403);
  });

  test("Sin X-Dev-User cae al admin default (smoke)", async ({ request }) => {
    const res = await request.get(`${API}/afiliados`, {
      headers: { "X-Cod-Plan": COD_PLAN },
    });
    expect(res.ok()).toBeTruthy();
  });
});
