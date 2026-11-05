import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, exists, ilike, or, sql, count, desc } from "drizzle-orm";
import type { AsignarPlan } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import {
  afiliados,
  planesAfiliado,
  Afiliado,
  NuevoAfiliado,
  PlanAfiliado,
} from "../../db/schema/afiliados";
import { planes } from "../../db/schema/planes";
import { formatearRut, rutValido } from "../../common/utils/rut";
import { planesDeAfiliados } from "./vigencia";
import { rutComparable } from "../../common/busqueda/criterios";
import type { CreateAfiliadoDto, UpdateAfiliadoDto, FiltroAfiliadosDto } from "./dto";

@Injectable()
export class AfiliadosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async buscar(filtro: FiltroAfiliadosDto) {
    // q: si parece RUT/email/término corto usa ILIKE (más predecible para
    // prefix match); si tiene 2+ palabras usa full-text search con ranking.
    const useFts = filtro.q && /\s/.test(filtro.q.trim());
    const ftQuery = useFts ? sql`plainto_tsquery('spanish', ${filtro.q})` : null;

    const where = and(
      filtro.codPlan
        ? exists(
            this.db
              .select({ id: planesAfiliado.id })
              .from(planesAfiliado)
              .where(
                and(
                  eq(planesAfiliado.afiliadoId, afiliados.id),
                  eq(planesAfiliado.codPlan, filtro.codPlan),
                ),
              ),
          )
        : undefined,
      filtro.canalId
        ? sql`exists (select 1 from planes_afiliado pa join planes p on p.cod_plan = pa.cod_plan where pa.afiliado_id = ${afiliados.id} and p.canal_id = ${filtro.canalId})`
        : undefined,
      filtro.rut
        ? sql`upper(regexp_replace(${afiliados.rut}, '[^0-9kK]', '', 'g')) like ${`%${rutComparable(filtro.rut)}%`}`
        : undefined,
      filtro.vigencia ? eq(afiliados.vigencia, filtro.vigencia) : undefined,
      filtro.q && !useFts
        ? or(
            ilike(afiliados.rut, `%${filtro.q}%`),
            ilike(afiliados.nombres, `%${filtro.q}%`),
            ilike(afiliados.apellidoPaterno, `%${filtro.q}%`),
            ilike(afiliados.email, `%${filtro.q}%`),
          )
        : undefined,
      ftQuery ? sql`search_vector @@ ${ftQuery}` : undefined,
    );

    const offset = (filtro.page - 1) * filtro.pageSize;
    const orderBy = ftQuery
      ? [desc(sql`ts_rank(search_vector, ${ftQuery})`)]
      : [afiliados.apellidoPaterno, afiliados.nombres];

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(afiliados)
        .where(where)
        .orderBy(...orderBy)
        .limit(filtro.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(afiliados).where(where),
    ]);

    const planesPorAfiliado = await planesDeAfiliados(
      this.db,
      rows.map((r) => r.id),
    );

    return {
      data: rows.map((r) => ({ ...r, planes: planesPorAfiliado.get(r.id) ?? [] })),
      page: filtro.page,
      pageSize: filtro.pageSize,
      total,
      totalPages: Math.ceil(total / filtro.pageSize),
    };
  }

  async obtener(id: string): Promise<Afiliado> {
    const [row] = await this.db.select().from(afiliados).where(eq(afiliados.id, id));
    if (!row) throw new NotFoundException(`Afiliado ${id} no existe`);
    return row;
  }

  async obtenerConPlanes(id: string) {
    const afiliado = await this.obtener(id);
    const planesMap = await planesDeAfiliados(this.db, [id]);
    return { ...afiliado, planes: planesMap.get(id) ?? [] };
  }

  async obtenerPorRut(rut: string): Promise<Afiliado | null> {
    const [row] = await this.db
      .select()
      .from(afiliados)
      .where(eq(afiliados.rut, formatearRut(rut)));
    return row ?? null;
  }

  async consultarPorRut(rut: string) {
    if (!rutValido(rut)) throw new BadRequestException(`RUT inválido: ${rut}`);
    const afiliado = await this.obtenerPorRut(rut);
    if (!afiliado) throw new NotFoundException(`RUT ${formatearRut(rut)} no está registrado`);
    const planesMap = await planesDeAfiliados(this.db, [afiliado.id]);
    return { ...afiliado, planes: planesMap.get(afiliado.id) ?? [] };
  }

  async crear(input: CreateAfiliadoDto): Promise<Afiliado> {
    if (!rutValido(input.rut)) {
      throw new BadRequestException(`RUT inválido: ${input.rut}`);
    }
    const rutFmt = formatearRut(input.rut);
    if (await this.obtenerPorRut(rutFmt)) {
      throw new ConflictException(`RUT ${rutFmt} ya está registrado`);
    }
    const payload: NuevoAfiliado = { ...input, rut: rutFmt, vigencia: input.vigencia ?? "Activo" };
    const [row] = await this.db.insert(afiliados).values(payload).returning();
    return row;
  }

  async actualizar(id: string, patch: UpdateAfiliadoDto): Promise<Afiliado> {
    await this.obtener(id);
    if (patch.rut && !rutValido(patch.rut)) {
      throw new BadRequestException(`RUT inválido: ${patch.rut}`);
    }
    const [row] = await this.db
      .update(afiliados)
      .set({
        ...patch,
        ...(patch.rut ? { rut: formatearRut(patch.rut) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(afiliados.id, id))
      .returning();
    return row;
  }

  // Soft-delete: marca como Eliminado en vez de borrar (cumplimiento normativo).
  async eliminar(id: string): Promise<Afiliado> {
    return this.actualizar(id, { vigencia: "Eliminado" });
  }

  async asignarPlan(afiliadoId: string, input: AsignarPlan): Promise<PlanAfiliado> {
    await this.obtener(afiliadoId);
    const [plan] = await this.db
      .select({ codPlan: planes.codPlan })
      .from(planes)
      .where(eq(planes.codPlan, input.codPlan));
    if (!plan) throw new NotFoundException(`Plan ${input.codPlan} no existe`);
    if (input.fechaTermino && input.fechaTermino < input.fechaInicio) {
      throw new BadRequestException("La fecha de término no puede ser anterior a la de inicio");
    }
    // Reasignar un plan ya existente lo reactiva con las nuevas fechas.
    const [row] = await this.db
      .insert(planesAfiliado)
      .values({
        afiliadoId,
        codPlan: input.codPlan,
        fechaInicio: input.fechaInicio,
        fechaTermino: input.fechaTermino ?? null,
        vigencia: "Activo",
      })
      .onConflictDoUpdate({
        target: [planesAfiliado.afiliadoId, planesAfiliado.codPlan],
        set: {
          fechaInicio: input.fechaInicio,
          fechaTermino: input.fechaTermino ?? null,
          vigencia: "Activo",
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async terminarPlan(afiliadoId: string, codPlan: string, fechaTermino: string): Promise<PlanAfiliado> {
    const [row] = await this.db
      .update(planesAfiliado)
      .set({ fechaTermino, updatedAt: new Date() })
      .where(and(eq(planesAfiliado.afiliadoId, afiliadoId), eq(planesAfiliado.codPlan, codPlan)))
      .returning();
    if (!row) throw new NotFoundException(`El afiliado no tiene el plan ${codPlan}`);
    return row;
  }
}
