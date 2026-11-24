import { eq, sql } from "drizzle-orm";
import { permisosDePerfil, type Permiso } from "@legalmene/shared";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { calcularDv } from "../../src/common/utils/rut";
import { competencias, materias } from "../../src/db/schema/maestros";
import { perfiles, perfilPermisos, usuarios } from "../../src/db/schema/usuarios";
import { documentos } from "../../src/db/schema/documentos";

// RUT válido y distinto en cada llamada: el RUT es único global y los specs corren
// en paralelo sobre la misma base. Rango 40–49 millones para no chocar con el seed.
export function rutAleatorio(): string {
  const cuerpo = String(40_000_000 + Math.floor(Math.random() * 10_000_000));
  return `${cuerpo}-${calcularDv(cuerpo)}`;
}

export function planAleatorio(prefijo = "TEST"): string {
  return `${prefijo}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Fecha AAAA-MM-DD desplazada en días desde hoy (UTC; los tests usan márgenes de varios días).
// Fecha (AAAA-MM-DD) a `dias` de hoy en Chile: las vigencias se evalúan con la fecha de Chile,
// que entre las 21:00 y la medianoche no coincide con la de UTC.
export function fechaRelativa(dias: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(Date.now() + dias * 86_400_000));
}

export interface MateriaPrueba {
  competenciaId: string;
  materiaId: string;
}

// Competencia + materia propias del spec (nombres aleatorios: los specs corren en paralelo).
// Borrar con borrarMateriaDePrueba() después de eliminar las atenciones que las usan.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function materiaDePrueba(db: NodePgDatabase<any>): Promise<MateriaPrueba> {
  const sufijo = Math.random().toString(36).slice(2, 8).toUpperCase();
  const [c] = await db.insert(competencias).values({ nombre: `Comp ${sufijo}` }).returning();
  const [m] = await db.insert(materias).values({ competenciaId: c.id, nombre: `Materia ${sufijo}` }).returning();
  return { competenciaId: c.id, materiaId: m.id };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function borrarMateriaDePrueba(db: NodePgDatabase<any>, ids: MateriaPrueba): Promise<void> {
  await db.execute(sql`DELETE FROM aranceles WHERE materia_id IN (SELECT id FROM materias WHERE competencia_id = ${ids.competenciaId})`);
  await db.execute(sql`DELETE FROM gestiones_plantilla WHERE materia_id IN (SELECT id FROM materias WHERE competencia_id = ${ids.competenciaId})`);
  await db.execute(sql`DELETE FROM coberturas WHERE materia_id IN (SELECT id FROM materias WHERE competencia_id = ${ids.competenciaId})`);
  await db.execute(sql`DELETE FROM gestiones_plantilla WHERE procedimiento_id IN (SELECT id FROM procedimientos WHERE competencia_id = ${ids.competenciaId})`);
  await db.execute(sql`DELETE FROM procedimientos WHERE competencia_id = ${ids.competenciaId}`);
  await db.execute(sql`DELETE FROM materias WHERE competencia_id = ${ids.competenciaId}`);
  await db.execute(sql`DELETE FROM competencias WHERE id = ${ids.competenciaId}`);
}

// Usuario propio del spec (email/oid aleatorios) con el perfil indicado y sus permisos
// efectivos. Borrar con DELETE FROM usuarios WHERE id = ...
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function usuarioDePrueba(db: NodePgDatabase<any>, perfil = "GERENCIA_SERVICIOS", extra: { jefeId?: string } = {}) {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const [p] = await db.select().from(perfiles).where(eq(perfiles.codigo, perfil));
  if (!p) throw new Error(`Perfil ${perfil} no existe`);
  const [u] = await db
    .insert(usuarios)
    .values({ entraOid: `oid-${sufijo}`, email: `test-${sufijo}@test.cl`, nombre: `Test ${perfil}`, perfilId: p.id, jefeId: extra.jefeId ?? null })
    .returning();
  const asignados = await db.select().from(perfilPermisos).where(eq(perfilPermisos.perfilId, p.id));
  return { ...u, permisos: permisosDePerfil(p.codigo, asignados.map((a) => a.permiso)) as Permiso[] };
}

// Borra las atenciones de un plan de prueba junto con sus registros dependientes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function borrarAtencionesDePlan(db: NodePgDatabase<any>, codPlan: string): Promise<void> {
  const ids = sql`(SELECT id FROM atenciones WHERE cod_plan = ${codPlan})`;
  await db.execute(sql`DELETE FROM derivaciones WHERE consulta_id IN ${ids} OR atencion_derivada_id IN ${ids}`);
  await db.execute(sql`DELETE FROM contrapartes WHERE atencion_id IN ${ids}`);
  await db.execute(sql`DELETE FROM provision_movimientos WHERE provision_id IN (SELECT id FROM provisiones WHERE atencion_id IN ${ids})`);
  await db.execute(sql`DELETE FROM provisiones_eventos WHERE provision_id IN (SELECT id FROM provisiones WHERE atencion_id IN ${ids})`);
  await db.execute(sql`DELETE FROM aranceles_atencion_eventos WHERE arancel_atencion_id IN (SELECT id FROM aranceles_atencion WHERE atencion_id IN ${ids})`);
  await db.execute(sql`DELETE FROM aranceles_atencion WHERE atencion_id IN ${ids}`);
  await db.execute(sql`DELETE FROM provisiones WHERE atencion_id IN ${ids}`);
  await db.execute(sql`DELETE FROM rendiciones_cliente WHERE atencion_id IN ${ids}`);
  await db.execute(sql`DELETE FROM documentos WHERE atencion_id IN ${ids}`);
  await db.execute(sql`DELETE FROM atenciones WHERE cod_plan = ${codPlan}`);
}

// Comprobante (documento) de una atención, para registrar gastos de provisión.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function comprobanteDePrueba(db: NodePgDatabase<any>, atencionId: string, subidoPor: string): Promise<string> {
  const [d] = await db
    .insert(documentos)
    .values({
      atencionId,
      nombre: "comprobante.pdf",
      mimeType: "application/pdf",
      tamanoBytes: 1,
      s3Bucket: "test",
      s3Key: `test/${atencionId}/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
      sha256: "0".repeat(64),
      subidoPor,
    })
    .returning({ id: documentos.id });
  return d.id;
}
