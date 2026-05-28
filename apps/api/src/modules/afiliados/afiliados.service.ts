import { Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { and, eq, ilike, or, sql, count } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { afiliados, Afiliado, NuevoAfiliado } from "../../db/schema/afiliados";
import { formatearRut, rutValido } from "../../common/utils/rut";
import type { CreateAfiliadoDto, UpdateAfiliadoDto, FiltroAfiliadosDto } from "./dto";

@Injectable()
export class AfiliadosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async buscar(codPlan: string, filtro: FiltroAfiliadosDto) {
    const where = and(
      eq(afiliados.codPlan, codPlan),
      filtro.vigencia ? eq(afiliados.vigencia, filtro.vigencia) : undefined,
      filtro.q
        ? or(
            ilike(afiliados.rut, `%${filtro.q}%`),
            ilike(afiliados.nombres, `%${filtro.q}%`),
            ilike(afiliados.apellidoPaterno, `%${filtro.q}%`),
            ilike(afiliados.email, `%${filtro.q}%`),
          )
        : undefined,
    );

    const offset = (filtro.page - 1) * filtro.pageSize;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(afiliados)
        .where(where)
        .orderBy(afiliados.apellidoPaterno, afiliados.nombres)
        .limit(filtro.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(afiliados).where(where),
    ]);

    return {
      data: rows,
      page: filtro.page,
      pageSize: filtro.pageSize,
      total,
      totalPages: Math.ceil(total / filtro.pageSize),
    };
  }

  async obtener(codPlan: string, id: string): Promise<Afiliado> {
    const [row] = await this.db
      .select()
      .from(afiliados)
      .where(and(eq(afiliados.id, id), eq(afiliados.codPlan, codPlan)));
    if (!row) throw new NotFoundException(`Afiliado ${id} no existe en plan ${codPlan}`);
    return row;
  }

  async obtenerPorRut(codPlan: string, rut: string): Promise<Afiliado | null> {
    const rutFmt = formatearRut(rut);
    const [row] = await this.db
      .select()
      .from(afiliados)
      .where(and(eq(afiliados.rut, rutFmt), eq(afiliados.codPlan, codPlan)));
    return row ?? null;
  }

  async crear(codPlan: string, input: CreateAfiliadoDto): Promise<Afiliado> {
    if (!rutValido(input.rut)) {
      throw new BadRequestException(`RUT inválido: ${input.rut}`);
    }
    const rutFmt = formatearRut(input.rut);

    const existing = await this.obtenerPorRut(codPlan, rutFmt);
    if (existing) {
      throw new BadRequestException(`RUT ${rutFmt} ya existe en plan ${codPlan}`);
    }

    const payload: NuevoAfiliado = {
      ...input,
      codPlan,
      rut: rutFmt,
      vigencia: input.vigencia ?? "Activo",
      fechaIngreso: input.fechaIngreso ? new Date(input.fechaIngreso) : undefined,
      fechaEgreso: input.fechaEgreso ? new Date(input.fechaEgreso) : null,
    };
    const [row] = await this.db.insert(afiliados).values(payload).returning();
    return row;
  }

  async actualizar(codPlan: string, id: string, patch: UpdateAfiliadoDto): Promise<Afiliado> {
    await this.obtener(codPlan, id);
    const { fechaIngreso, fechaEgreso, ...rest } = patch;
    const payload: Partial<NuevoAfiliado> = {
      ...rest,
      ...(patch.rut ? { rut: formatearRut(patch.rut) } : {}),
      ...(fechaIngreso ? { fechaIngreso: new Date(fechaIngreso) } : {}),
      ...(fechaEgreso ? { fechaEgreso: new Date(fechaEgreso) } : {}),
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .update(afiliados)
      .set(payload)
      .where(and(eq(afiliados.id, id), eq(afiliados.codPlan, codPlan)))
      .returning();
    return row;
  }

  // Soft-delete: marca como Eliminado en vez de borrar (cumplimiento normativo).
  async eliminar(codPlan: string, id: string): Promise<Afiliado> {
    return this.actualizar(codPlan, id, { vigencia: "Eliminado", fechaEgreso: new Date().toISOString() } as UpdateAfiliadoDto);
  }
}
