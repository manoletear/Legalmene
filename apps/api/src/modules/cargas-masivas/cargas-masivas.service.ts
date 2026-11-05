import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { afiliados, planesAfiliado, NuevoAfiliado } from "../../db/schema/afiliados";
import { planes } from "../../db/schema/planes";
import { formatearRut, rutValido } from "../../common/utils/rut";
import { hoyChile } from "../afiliados/vigencia";
import type { CargaMasivaResultado, TipoCargaMasiva } from "@legalmene/shared";

interface FilaCSV {
  rut: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  comuna?: string;
  region?: string;
  fecha_nacimiento?: string;
  fecha_inicio?: string;
  fecha_termino?: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface RegistroValido {
  fila: number;
  persona: NuevoAfiliado;
  fechaInicio: string | null;
  fechaTermino: string | null;
}

@Injectable()
export class CargasMasivasService {
  private readonly logger = new Logger(CargasMasivasService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Anexo §III. Ambas modalidades:
   *   - Afiliados: si el RUT no existe se registra; si existe NO se actualizan sus datos.
   *   - PlanesAfiliado: si la relación RUT–Plan no existe se crea; si existe se actualiza
   *     la fecha de término (y vuelve a quedar Activa).
   * STOCK además termina (fecha_termino = hoy, vigencia Eliminado) las relaciones del plan
   * cuyos RUT no vienen en el archivo.
   */
  async cargarAfiliados(
    codPlan: string,
    tipo: TipoCargaMasiva,
    csvBuffer: Buffer,
  ): Promise<CargaMasivaResultado> {
    const inicio = Date.now();

    const [plan] = await this.db
      .select({ codPlan: planes.codPlan })
      .from(planes)
      .where(eq(planes.codPlan, codPlan));
    if (!plan) throw new NotFoundException(`Plan ${codPlan} no existe`);

    let filas: FilaCSV[];
    try {
      filas = parse(csvBuffer, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
      }) as FilaCSV[];
    } catch (err) {
      throw new BadRequestException(`CSV inválido: ${err instanceof Error ? err.message : err}`);
    }

    const resultado: CargaMasivaResultado = {
      tipo,
      codPlan,
      totalRegistros: filas.length,
      insertados: 0,
      actualizados: 0,
      eliminados: 0,
      errores: [],
      duracionMs: 0,
    };

    if (filas.length === 0) {
      resultado.duracionMs = Date.now() - inicio;
      return resultado;
    }

    // Validar y normalizar todas las filas antes de tocar la DB.
    const rutsValidos = new Set<string>();
    const registros: RegistroValido[] = [];

    filas.forEach((fila, idx) => {
      const nroLinea = idx + 2; // +1 por header, +1 por base 1.
      if (!fila.rut) {
        resultado.errores.push({
          fila: nroLinea,
          mensaje: "RUT vacío",
          datos: fila as unknown as Record<string, unknown>,
        });
        return;
      }
      if (!rutValido(fila.rut)) {
        resultado.errores.push({ fila: nroLinea, mensaje: `RUT inválido: ${fila.rut}` });
        return;
      }
      const rutFmt = formatearRut(fila.rut);
      if (rutsValidos.has(rutFmt)) {
        resultado.errores.push({ fila: nroLinea, mensaje: `RUT duplicado en archivo: ${rutFmt}` });
        return;
      }
      if (!fila.nombres || !fila.apellido_paterno) {
        resultado.errores.push({
          fila: nroLinea,
          mensaje: "nombres y apellido_paterno son obligatorios",
        });
        return;
      }
      for (const campo of ["fecha_inicio", "fecha_termino"] as const) {
        if (fila[campo] && !FECHA.test(fila[campo]!)) {
          resultado.errores.push({ fila: nroLinea, mensaje: `${campo} debe tener formato AAAA-MM-DD` });
          return;
        }
      }
      rutsValidos.add(rutFmt);
      registros.push({
        fila: nroLinea,
        persona: {
          rut: rutFmt,
          nombres: fila.nombres,
          apellidoPaterno: fila.apellido_paterno,
          apellidoMaterno: fila.apellido_materno || null,
          email: fila.email || null,
          telefono: fila.telefono || null,
          direccion: fila.direccion || null,
          comuna: fila.comuna || null,
          region: fila.region || null,
          fechaNacimiento: fila.fecha_nacimiento || null,
          vigencia: "Activo",
        },
        fechaInicio: fila.fecha_inicio || null,
        fechaTermino: fila.fecha_termino || null,
      });
    });

    if (registros.length === 0) {
      resultado.duracionMs = Date.now() - inicio;
      return resultado;
    }

    // Transacción para que el reemplazo de STOCK sea atómico.
    await this.db.transaction(async (tx) => {
      await tx
        .insert(afiliados)
        .values(registros.map((r) => r.persona))
        .onConflictDoNothing({ target: afiliados.rut });

      const personas = await tx
        .select({ id: afiliados.id, rut: afiliados.rut })
        .from(afiliados)
        .where(inArray(afiliados.rut, Array.from(rutsValidos)));
      const idPorRut = new Map(personas.map((p) => [p.rut, p.id]));

      const relaciones = await tx
        .insert(planesAfiliado)
        .values(
          registros.map((r) => ({
            afiliadoId: idPorRut.get(r.persona.rut)!,
            codPlan,
            fechaInicio: r.fechaInicio ?? sql`${hoyChile}`,
            fechaTermino: r.fechaTermino,
            vigencia: "Activo" as const,
          })),
        )
        .onConflictDoUpdate({
          target: [planesAfiliado.afiliadoId, planesAfiliado.codPlan],
          set: {
            fechaTermino: sql`excluded.fecha_termino`,
            vigencia: "Activo",
            updatedAt: new Date(),
          },
        })
        .returning({ id: planesAfiliado.id, isNew: sql<boolean>`xmax = 0` });

      resultado.insertados = relaciones.filter((r) => r.isNew).length;
      resultado.actualizados = relaciones.length - resultado.insertados;

      if (tipo === "STOCK") {
        const terminadas = await tx
          .update(planesAfiliado)
          .set({ fechaTermino: sql`${hoyChile}`, vigencia: "Eliminado", updatedAt: new Date() })
          .where(
            and(
              eq(planesAfiliado.codPlan, codPlan),
              notInArray(planesAfiliado.afiliadoId, Array.from(idPorRut.values())),
              ne(planesAfiliado.vigencia, "Eliminado"),
            ),
          )
          .returning({ id: planesAfiliado.id });
        resultado.eliminados = terminadas.length;
      }
    });

    resultado.duracionMs = Date.now() - inicio;
    this.logger.log(
      `Carga ${tipo} plan=${codPlan}: ins=${resultado.insertados} upd=${resultado.actualizados} del=${resultado.eliminados} err=${resultado.errores.length} ${resultado.duracionMs}ms`,
    );
    return resultado;
  }
}
