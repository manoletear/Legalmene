import { expect, type APIRequestContext } from "@playwright/test";

const API = process.env.API_BASE ?? "http://localhost:3001/api/v1";

type Maestro = { id: string; nombre: string };

// Crea una asesoría nueva (afiliado con plan vigente y una materia de asesoría) para que la prueba
// no dependa de lo que traiga el seed ni de lo que dejaron otras pruebas.
export async function crearAsesoria(request: APIRequestContext, asunto: string): Promise<{ id: string; correlativo: string }> {
  const afi = await request.get(`${API}/afiliados?pageSize=200&vigencia=Activo`).then((r) => r.json());
  type A = { id: string; planes: { codPlan: string; vigente: boolean }[] };
  const titular = (afi.data as A[]).find((a) => a.planes.some((p) => p.vigente));
  expect(titular, "el seed debe tener un afiliado con plan vigente").toBeTruthy();
  const codPlan = titular!.planes.find((p) => p.vigente)!.codPlan;
  const comps: Maestro[] = await request.get(`${API}/maestros/competencias?vigente=true`).then((r) => r.json());
  for (const c of comps) {
    const mats: Maestro[] = await request
      .get(`${API}/maestros/materias?competenciaId=${c.id}&vigente=true&aplicaA=Asesoria`)
      .then((r) => r.json());
    if (!mats.length) continue;
    const res = await request.post(`${API}/atenciones/asesorias`, {
      data: { afiliadoId: titular!.id, codPlan, competenciaId: c.id, materiaId: mats[0].id, asunto },
    });
    expect(res.status(), await res.text()).toBe(201);
    return res.json();
  }
  throw new Error("No hay materias de asesoría en el seed");
}
