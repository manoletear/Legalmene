import { and, eq, inArray } from "drizzle-orm";
import { PERFIL_ADMIN } from "@legalmene/shared";
import type { Database } from "../../db/database.module";
import type { CrearNotif } from "./notif-inbox.service";
import { atenciones } from "../../db/schema/atenciones";
import { perfilPermisos, perfiles, usuarios } from "../../db/schema/usuarios";

// Destinatarios de avisos en la aplicación (y luego de correos) de los flujos del Anexo. Solo
// usuarios activos y no bloqueados. Los permisos se leen del perfil (el administrador no se
// incluye por tener todos los permisos implícitos, para no recibir cada aviso operativo).

export async function usuariosConPermiso(db: Database, permisos: string[]): Promise<string[]> {
  if (!permisos.length) return [];
  const filas = await db
    .selectDistinct({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(perfilPermisos, eq(perfilPermisos.perfilId, usuarios.perfilId))
    .where(and(inArray(perfilPermisos.permiso, permisos), eq(usuarios.activo, true), eq(usuarios.bloqueado, false)));
  return filas.map((f) => f.id);
}

export async function administradores(db: Database): Promise<string[]> {
  const filas = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
    .where(and(eq(perfiles.codigo, PERFIL_ADMIN), eq(usuarios.activo, true), eq(usuarios.bloqueado, false)));
  return filas.map((f) => f.id);
}

export async function jefeDe(db: Database, usuarioId: string | null | undefined): Promise<string | null> {
  if (!usuarioId) return null;
  const [u] = await db.select({ jefeId: usuarios.jefeId }).from(usuarios).where(eq(usuarios.id, usuarioId));
  return u?.jefeId ?? null;
}

export interface EquipoAtencion {
  atencionId: string;
  codPlan: string;
  correlativo: string;
  tipo: string;
  // Abogado responsable (AR): el asignado o, si no hay, quien la creó.
  abogadoId: string | null;
  // Su jefatura (AJ / AJJ / JC).
  jefeId: string | null;
}

export async function equipoDeAtencion(db: Database, atencionId: string): Promise<EquipoAtencion | null> {
  const [a] = await db
    .select({
      codPlan: atenciones.codPlan,
      correlativo: atenciones.correlativo,
      tipo: atenciones.tipo,
      abogadoAsignadoId: atenciones.abogadoAsignadoId,
      creadoPorId: atenciones.creadoPorId,
    })
    .from(atenciones)
    .where(eq(atenciones.id, atencionId));
  if (!a) return null;
  const abogadoId = a.abogadoAsignadoId ?? a.creadoPorId ?? null;
  return { atencionId, codPlan: a.codPlan, correlativo: a.correlativo, tipo: a.tipo, abogadoId, jefeId: await jefeDe(db, abogadoId) };
}

// Mismo aviso a varios usuarios, sin repetidos ni nulos y sin avisarle a quien hizo la acción.
export async function avisar(
  notif: { crearBulk(items: CrearNotif[]): Promise<unknown> },
  destinatarios: Iterable<string | null | undefined>,
  aviso: Omit<CrearNotif, "usuarioId">,
  excluir?: string | null,
): Promise<number> {
  const ids = new Set<string>();
  for (const d of destinatarios) if (d && d !== excluir) ids.add(d);
  if (!ids.size) return 0;
  await notif.crearBulk([...ids].map((usuarioId) => ({ ...aviso, usuarioId })));
  return ids.size;
}
