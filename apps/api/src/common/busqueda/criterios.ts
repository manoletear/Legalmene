import { and, eq, ilike, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { CriteriosBusqueda } from "@legalmene/shared";
import { atenciones } from "../../db/schema/atenciones";

// Dígitos y K de un RUT tal como lo escribe el usuario ("12.345.678-5" → "123456785").
export function rutComparable(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

// Fecha calendario en Chile de un timestamp (las búsquedas por día son en hora local).
export function fechaChile(col: AnyColumn | SQL): SQL {
  return sql`(${col} AT TIME ZONE 'America/Santiago')::date`;
}

export function rangoFechas(col: AnyColumn | SQL, desde?: string, hasta?: string): SQL | undefined {
  return and(
    desde ? sql`${fechaChile(col)} >= ${desde}::date` : undefined,
    hasta ? sql`${fechaChile(col)} <= ${hasta}::date` : undefined,
  );
}

// Condición sobre `atenciones` para los criterios comunes del Anexo §XI. La fecha se aplica a
// `columnaFecha` (apertura por defecto; solicitud, pago, etc. en otras búsquedas). No aplica el
// alcance del usuario: el llamador combina con filtroAtenciones().
export function condicionAtencion(c: CriteriosBusqueda, columnaFecha: AnyColumn | SQL = atenciones.fechaApertura): SQL | undefined {
  const rut = c.rut ? rutComparable(c.rut) : "";
  return and(
    c.correlativo ? ilike(atenciones.correlativo, `%${c.correlativo}%`) : undefined,
    rut
      ? sql`${atenciones.afiliadoId} in (select a.id from afiliados a where upper(regexp_replace(a.rut, '[^0-9kK]', '', 'g')) like ${`%${rut}%`})`
      : undefined,
    c.abogadoId ? eq(atenciones.abogadoAsignadoId, c.abogadoId) : undefined,
    c.codPlan ? eq(atenciones.codPlan, c.codPlan) : undefined,
    c.canalId ? sql`${atenciones.codPlan} in (select p.cod_plan from planes p where p.canal_id = ${c.canalId})` : undefined,
    c.competenciaId ? eq(atenciones.competenciaId, c.competenciaId) : undefined,
    c.materiaId ? eq(atenciones.materiaId, c.materiaId) : undefined,
    c.bien ? sql`${atenciones.afiliadoId} in (${condicionBien(c.bien)})` : undefined,
    rangoFechas(columnaFecha, c.fechaDesde, c.fechaHasta),
  );
}

// Afiliados con un bien cubierto cuyo identificador o descripción contiene el texto.
export function condicionBien(texto: string): SQL {
  const t = `%${texto.trim()}%`;
  return sql`select b.afiliado_id from bienes_afiliado b where b.vigencia <> 'Eliminado' and (b.identificador ilike ${t} or b.descripcion ilike ${t})`;
}
