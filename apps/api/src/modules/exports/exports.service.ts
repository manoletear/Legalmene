import { Inject, Injectable } from "@nestjs/common";
import { and, eq, getTableColumns } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { afiliados, planesAfiliado } from "../../db/schema/afiliados";
import { atenciones } from "../../db/schema/atenciones";
import { competencias, materias } from "../../db/schema/maestros";

// Minimal CSV escaping per RFC 4180: quote when needed, double inner quotes.
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\n") + "\n";
}

@Injectable()
export class ExportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Una fila por relación RUT–Plan (PlanesAfiliado).
  async afiliadosCsv(codPlan?: string): Promise<string> {
    const rows = await this.db
      .select({
        rut: afiliados.rut,
        nombres: afiliados.nombres,
        apellidoPaterno: afiliados.apellidoPaterno,
        apellidoMaterno: afiliados.apellidoMaterno,
        email: afiliados.email,
        telefono: afiliados.telefono,
        comuna: afiliados.comuna,
        region: afiliados.region,
        vigencia: afiliados.vigencia,
        codPlan: planesAfiliado.codPlan,
        fechaInicio: planesAfiliado.fechaInicio,
        fechaTermino: planesAfiliado.fechaTermino,
        vigenciaPlan: planesAfiliado.vigencia,
      })
      .from(afiliados)
      .innerJoin(planesAfiliado, eq(planesAfiliado.afiliadoId, afiliados.id))
      .where(codPlan ? eq(planesAfiliado.codPlan, codPlan) : undefined)
      .orderBy(afiliados.apellidoPaterno, afiliados.nombres, planesAfiliado.codPlan);

    return toCsv(
      [
        "rut",
        "nombres",
        "apellido_paterno",
        "apellido_materno",
        "email",
        "telefono",
        "comuna",
        "region",
        "vigencia",
        "cod_plan",
        "fecha_inicio",
        "fecha_termino",
        "vigencia_plan",
      ],
      rows.map((a) => [
        a.rut,
        a.nombres,
        a.apellidoPaterno,
        a.apellidoMaterno,
        a.email,
        a.telefono,
        a.comuna,
        a.region,
        a.vigencia,
        a.codPlan,
        a.fechaInicio,
        a.fechaTermino,
        a.vigenciaPlan,
      ]),
    );
  }

  async atencionesCsv(codPlan?: string): Promise<string> {
    const rows = await this.db
      .select({ ...getTableColumns(atenciones), competencia: competencias.nombre, materia: materias.nombre })
      .from(atenciones)
      .innerJoin(competencias, eq(competencias.id, atenciones.competenciaId))
      .innerJoin(materias, eq(materias.id, atenciones.materiaId))
      .where(and(filtroAtenciones(), codPlan ? eq(atenciones.codPlan, codPlan) : undefined))
      .orderBy(atenciones.fechaApertura);

    return toCsv(
      [
        "correlativo",
        "cod_plan",
        "tipo",
        "estado",
        "competencia",
        "materia",
        "asunto",
        "prioridad",
        "afiliado_id",
        "abogado_asignado_id",
        "fecha_apertura",
        "fecha_cierre",
        "fecha_ultima_gestion",
      ],
      rows.map((a) => [
        a.correlativo,
        a.codPlan,
        a.tipo,
        a.estado,
        a.competencia,
        a.materia,
        a.asunto,
        a.prioridad,
        a.afiliadoId,
        a.abogadoAsignadoId,
        a.fechaApertura,
        a.fechaCierre,
        a.fechaUltimaGestion,
      ]),
    );
  }
}
