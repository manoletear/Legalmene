import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PlanAfiliadoDetalle } from "@legalmene/shared";
import { Database } from "../../db/database.module";
import { planesAfiliado } from "../../db/schema/afiliados";
import { planes } from "../../db/schema/planes";

// Fecha de hoy en Chile: la vigencia RUT–Plan se evalúa por día calendario local.
export const hoyChile = sql`(now() AT TIME ZONE 'America/Santiago')::date`;

export const planVigenteSql = sql<boolean>`(
  ${planesAfiliado.vigencia} = 'Activo'
  AND ${planesAfiliado.fechaInicio} <= ${hoyChile}
  AND (${planesAfiliado.fechaTermino} IS NULL OR ${planesAfiliado.fechaTermino} >= ${hoyChile})
  AND ${planes.vigente}
)`;

// Planes de uno o más afiliados, vigentes primero.
export async function planesDeAfiliados(
  db: Database,
  afiliadoIds: string[],
): Promise<Map<string, PlanAfiliadoDetalle[]>> {
  const resultado = new Map<string, PlanAfiliadoDetalle[]>();
  if (afiliadoIds.length === 0) return resultado;
  const rows = await db
    .select({
      id: planesAfiliado.id,
      afiliadoId: planesAfiliado.afiliadoId,
      codPlan: planesAfiliado.codPlan,
      fechaInicio: planesAfiliado.fechaInicio,
      fechaTermino: planesAfiliado.fechaTermino,
      vigencia: planesAfiliado.vigencia,
      createdAt: planesAfiliado.createdAt,
      updatedAt: planesAfiliado.updatedAt,
      nombrePlan: planes.nombre,
      vigente: planVigenteSql,
    })
    .from(planesAfiliado)
    .innerJoin(planes, eq(planesAfiliado.codPlan, planes.codPlan))
    .where(inArray(planesAfiliado.afiliadoId, afiliadoIds))
    .orderBy(desc(planVigenteSql), asc(planesAfiliado.codPlan));
  for (const r of rows) {
    const detalle: PlanAfiliadoDetalle = {
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      vigente: Boolean(r.vigente),
    };
    const lista = resultado.get(r.afiliadoId) ?? [];
    lista.push(detalle);
    resultado.set(r.afiliadoId, lista);
  }
  return resultado;
}
