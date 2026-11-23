import { NotFoundException } from "@nestjs/common";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { alcanceAtenciones } from "@legalmene/shared";
import type { Database } from "../../db/database.module";
import { atenciones } from "../../db/schema/atenciones";
import { accesoActual } from "./contexto";

// Condición sobre `atenciones` con lo que el usuario actual puede ver (Anexo §IV):
// - atenciones.ver_todas: todo.
// - atenciones.ver_equipo: lo propio y lo asignado a quienes tienen a este usuario de jefe.
// - resto: asignadas a él, creadas por él o con una gestión a su cargo (tramitador).
// undefined = sin restricción. Todo endpoint que lea atenciones o algo colgado de una
// atención debe pasar por aquí.
export function filtroAtenciones(): SQL | undefined {
  const acceso = accesoActual();
  if (!acceso) return undefined;
  const alcance = alcanceAtenciones(acceso.permisos);
  if (alcance === "todas") return undefined;
  const yo = acceso.usuarioId;
  const condiciones: SQL[] = [
    eq(atenciones.abogadoAsignadoId, yo),
    eq(atenciones.creadoPorId, yo),
    sql`exists (select 1 from gestiones g where g.atencion_id = ${atenciones.id} and g.responsable_id = ${yo})`,
  ];
  if (alcance === "equipo") {
    condiciones.push(sql`${atenciones.abogadoAsignadoId} in (select u.id from usuarios u where u.jefe_id = ${yo})`);
  }
  return or(...condiciones);
}

// 404 (no 403) si la atención no existe o el usuario no la puede ver: no revela que existe.
export async function asegurarAtencionVisible(db: Database, atencionId: string): Promise<void> {
  const filtro = filtroAtenciones();
  const [row] = await db
    .select({ id: atenciones.id })
    .from(atenciones)
    .where(and(eq(atenciones.id, atencionId), filtro));
  if (!row) throw new NotFoundException(`Atención ${atencionId} no existe`);
}

// Parte de las claves de caché: los resultados acotados son distintos por usuario.
export function claveAlcance(): string {
  const acceso = accesoActual();
  if (!acceso || alcanceAtenciones(acceso.permisos) === "todas") return "todas";
  return `u:${acceso.usuarioId}`;
}
