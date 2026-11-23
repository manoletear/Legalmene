import { ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { CreateFeriado, UpdateFeriado } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { feriados } from "../../db/schema/maestros";
import { feriadosLegales } from "../../common/utils/feriados-chile";
import { establecerFeriados, hoyChileISO } from "../../common/utils/dias-habiles";

// Mantiene la tabla de feriados y el calendario en memoria que usan los plazos en días hábiles.
@Injectable()
export class FeriadosService implements OnModuleInit {
  private readonly logger = new Logger(FeriadosService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.sincronizar();
    } catch (err) {
      // Sin tabla (p. ej. antes de migrar) los plazos siguen contando solo fines de semana.
      this.logger.warn(`No se pudieron cargar los feriados: ${(err as Error).message}`);
    }
  }

  // Cada 10 minutos: asegura los legales del año en curso y el siguiente, y recarga el calendario
  // (otra instancia pudo editarlo).
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sincronizar(): Promise<void> {
    const anio = Number(hoyChileISO().slice(0, 4));
    await this.asegurarLegales(anio);
    await this.asegurarLegales(anio + 1);
    await this.recargar();
  }

  // Inserta los feriados legales que falten; no toca los existentes (un administrador pudo
  // desactivarlos o renombrarlos).
  async asegurarLegales(anio: number): Promise<number> {
    const filas = feriadosLegales(anio).map((f) => ({ ...f, origen: "Legal" as const }));
    const nuevos = await this.db.insert(feriados).values(filas).onConflictDoNothing().returning({ id: feriados.id });
    return nuevos.length;
  }

  async recargar(): Promise<void> {
    const filas = await this.db.select({ fecha: feriados.fecha }).from(feriados).where(eq(feriados.vigente, true));
    establecerFeriados(filas.map((f) => f.fecha));
  }

  async listar(anio?: number) {
    const where = anio ? and(gte(feriados.fecha, `${anio}-01-01`), lte(feriados.fecha, `${anio}-12-31`)) : undefined;
    return this.db.select().from(feriados).where(where).orderBy(asc(feriados.fecha));
  }

  async crear(input: CreateFeriado) {
    const [row] = await this.db
      .insert(feriados)
      .values({ fecha: input.fecha, nombre: input.nombre, origen: "Manual" })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException(`Ya existe un feriado el ${input.fecha}`);
    await this.recargar();
    return row;
  }

  async actualizar(id: string, patch: UpdateFeriado) {
    if (Object.keys(patch).length === 0) {
      const [actual] = await this.db.select().from(feriados).where(eq(feriados.id, id));
      if (!actual) throw new NotFoundException(`Feriado ${id} no existe`);
      return actual;
    }
    const [row] = await this.db.update(feriados).set(patch).where(eq(feriados.id, id)).returning();
    if (!row) throw new NotFoundException(`Feriado ${id} no existe`);
    await this.recargar();
    return row;
  }
}
