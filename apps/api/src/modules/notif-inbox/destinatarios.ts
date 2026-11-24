import { and, eq, inArray } from "drizzle-orm";
import { PERFIL_ADMIN } from "@legalmene/shared";
import type { Database } from "../../db/database.module";
import type { CrearNotif } from "./notif-inbox.service";
import type { Casilla, CorreosService } from "../correos/correos.service";
import { plantillaAviso } from "../correos/plantillas";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
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
  afiliadoRut: string | null;
  afiliadoEmail: string | null;
  afiliadoNombre: string | null;
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
      afiliadoRut: afiliados.rut,
      afiliadoEmail: afiliados.email,
      afiliadoNombre: afiliados.nombres,
    })
    .from(atenciones)
    .leftJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
    .where(eq(atenciones.id, atencionId));
  if (!a) return null;
  const abogadoId = a.abogadoAsignadoId ?? a.creadoPorId ?? null;
  return {
    atencionId,
    codPlan: a.codPlan,
    correlativo: a.correlativo,
    tipo: a.tipo,
    afiliadoRut: a.afiliadoRut,
    afiliadoEmail: a.afiliadoEmail,
    afiliadoNombre: a.afiliadoNombre,
    abogadoId,
    jefeId: await jefeDe(db, abogadoId),
  };
}

// Mismo aviso a varios usuarios, sin repetidos ni nulos y sin avisarle a quien hizo la acción.
// Con `correo`, el aviso también sale por correo a esos usuarios y a las casillas indicadas.
export async function avisar(
  notif: { crearBulk(items: CrearNotif[]): Promise<unknown> },
  destinatarios: Iterable<string | null | undefined>,
  aviso: Omit<CrearNotif, "usuarioId">,
  excluir?: string | null,
  correo?: { servicio?: CorreosService | null; casillas?: Casilla[]; atencionId?: string | null; plantilla?: string },
): Promise<number> {
  const ids = new Set<string>();
  for (const d of destinatarios) if (d && d !== excluir) ids.add(d);
  if (ids.size) await notif.crearBulk([...ids].map((usuarioId) => ({ ...aviso, usuarioId })));
  if (correo?.servicio) {
    const contenido = plantillaAviso({
      titulo: aviso.titulo,
      detalle: aviso.detalle,
      url: aviso.accionUrl ? correo.servicio.url(aviso.accionUrl) : null,
    });
    await correo.servicio.aUsuarios(ids, contenido, {
      plantilla: correo.plantilla ?? "aviso",
      atencionId: correo.atencionId,
      enviadoPorId: excluir ?? null,
      casillas: correo.casillas,
    });
  }
  return ids.size;
}
