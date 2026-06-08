import { Inject, Injectable, Logger, BadRequestException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { afiliados, NuevoAfiliado } from "../../db/schema/afiliados";
import { formatearRut, rutValido } from "../../common/utils/rut";
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
}

@Injectable()
export class CargasMasivasService {
  private readonly logger = new Logger(CargasMasivasService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * FLUJO: actualiza/inserta los registros del archivo. NO toca afiliados no listados.
   * STOCK: además marca como "Eliminado" todo afiliado del plan que NO venga en el archivo
   *        (reemplazo total del padrón vigente). Punto 03.2 del Anexo.
   */
  async cargarAfiliados(
    codPlan: string,
    tipo: TipoCargaMasiva,
    csvBuffer: Buffer,
  ): Promise<CargaMasivaResultado> {
    const inicio = Date.now();

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
    const registrosValidos: { fila: number; payload: NuevoAfiliado }[] = [];

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
        resultado.errores.push({
          fila: nroLinea,
          mensaje: `RUT duplicado en archivo: ${rutFmt}`,
        });
        return;
      }
      if (!fila.nombres || !fila.apellido_paterno) {
        resultado.errores.push({
          fila: nroLinea,
          mensaje: "nombres y apellido_paterno son obligatorios",
        });
        return;
      }
      rutsValidos.add(rutFmt);
      registrosValidos.push({
        fila: nroLinea,
        payload: {
          codPlan,
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
      });
    });

    if (registrosValidos.length === 0) {
      resultado.duracionMs = Date.now() - inicio;
      return resultado;
    }

    // Procesar en transacción para garantizar atomicidad del STOCK switch.
    await this.db.transaction(async (tx) => {
      // UPSERT por (cod_plan, rut). Detectamos insert vs update con xmax.
      const upserted = await tx
        .insert(afiliados)
        .values(registrosValidos.map((r) => r.payload))
        .onConflictDoUpdate({
          target: [afiliados.codPlan, afiliados.rut],
          set: {
            nombres: sql`excluded.nombres`,
            apellidoPaterno: sql`excluded.apellido_paterno`,
            apellidoMaterno: sql`excluded.apellido_materno`,
            email: sql`excluded.email`,
            telefono: sql`excluded.telefono`,
            direccion: sql`excluded.direccion`,
            comuna: sql`excluded.comuna`,
            region: sql`excluded.region`,
            fechaNacimiento: sql`excluded.fecha_nacimiento`,
            vigencia: "Activo",
            fechaEgreso: null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: afiliados.id, isNew: sql<boolean>`xmax = 0` });

      resultado.insertados = upserted.filter((r) => r.isNew).length;
      resultado.actualizados = upserted.length - resultado.insertados;

      // STOCK: marcar como Eliminado todos los del plan que no estén en el archivo.
      if (tipo === "STOCK") {
        const result = await tx
          .update(afiliados)
          .set({
            vigencia: "Eliminado",
            fechaEgreso: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(afiliados.codPlan, codPlan),
              notInArray(afiliados.rut, Array.from(rutsValidos)),
              eq(afiliados.vigencia, "Activo"),
            ),
          )
          .returning({ id: afiliados.id });
        resultado.eliminados = result.length;
      }
    });

    resultado.duracionMs = Date.now() - inicio;
    this.logger.log(
      `Carga ${tipo} plan=${codPlan}: ins=${resultado.insertados} upd=${resultado.actualizados} del=${resultado.eliminados} err=${resultado.errores.length} ${resultado.duracionMs}ms`,
    );
    return resultado;
  }
}
