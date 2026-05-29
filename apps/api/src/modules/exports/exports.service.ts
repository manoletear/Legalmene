import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { afiliados } from "../../db/schema/afiliados";
import { atenciones } from "../../db/schema/atenciones";

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

  async afiliadosCsv(codPlan: string): Promise<string> {
    const rows = await this.db
      .select()
      .from(afiliados)
      .where(eq(afiliados.codPlan, codPlan))
      .orderBy(afiliados.apellidoPaterno, afiliados.nombres);

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
        "fecha_ingreso",
        "fecha_egreso",
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
        a.fechaIngreso,
        a.fechaEgreso,
      ]),
    );
  }

  async atencionesCsv(codPlan: string): Promise<string> {
    const rows = await this.db
      .select()
      .from(atenciones)
      .where(eq(atenciones.codPlan, codPlan))
      .orderBy(atenciones.fechaApertura);

    return toCsv(
      [
        "correlativo",
        "tipo",
        "estado",
        "competencia",
        "materia",
        "prioridad",
        "afiliado_id",
        "abogado_asignado_id",
        "fecha_apertura",
        "fecha_cierre",
        "fecha_ultima_gestion",
      ],
      rows.map((a) => [
        a.correlativo,
        a.tipo,
        a.estado,
        a.competencia,
        a.materia,
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
