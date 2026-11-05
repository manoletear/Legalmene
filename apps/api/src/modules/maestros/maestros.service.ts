import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, getTableColumns, SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { ZodTypeAny } from "zod";
import {
  CreateCompetenciaSchema,
  CreateMaestroSimpleSchema,
  CreateMateriaSchema,
  CreateProcedimientoSchema,
  CreateTribunalSchema,
  UpdateCompetenciaSchema,
  UpdateMaestroSimpleSchema,
  UpdateMateriaSchema,
  UpdateProcedimientoSchema,
  UpdateTribunalSchema,
  type TipoAtencion,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import {
  calidadesProcesales,
  causasTermino,
  competencias,
  materias,
  organismos,
  procedimientos,
  tiposConsulta,
  tribunales,
  type MateriaRow,
} from "../../db/schema/maestros";
import { esViolacionUnica } from "../../common/utils/pg-errors";

interface DefMaestro {
  table: PgTable;
  etiqueta: string;
  create: ZodTypeAny;
  update: ZodTypeAny;
  // Maestros que dependen de una competencia (materias, procedimientos).
  porCompetencia?: boolean;
}

export const MAESTROS = {
  competencias: { table: competencias, etiqueta: "competencia", create: CreateCompetenciaSchema, update: UpdateCompetenciaSchema },
  materias: { table: materias, etiqueta: "materia", create: CreateMateriaSchema, update: UpdateMateriaSchema, porCompetencia: true },
  procedimientos: {
    table: procedimientos,
    etiqueta: "procedimiento",
    create: CreateProcedimientoSchema,
    update: UpdateProcedimientoSchema,
    porCompetencia: true,
  },
  tribunales: { table: tribunales, etiqueta: "tribunal", create: CreateTribunalSchema, update: UpdateTribunalSchema },
  organismos: { table: organismos, etiqueta: "organismo", create: CreateMaestroSimpleSchema, update: UpdateMaestroSimpleSchema },
  "tipos-consulta": {
    table: tiposConsulta,
    etiqueta: "tipo de consulta",
    create: CreateMaestroSimpleSchema,
    update: UpdateMaestroSimpleSchema,
  },
  "causas-termino": {
    table: causasTermino,
    etiqueta: "causa de término",
    create: CreateMaestroSimpleSchema,
    update: UpdateMaestroSimpleSchema,
  },
  "calidades-procesales": {
    table: calidadesProcesales,
    etiqueta: "calidad procesal",
    create: CreateMaestroSimpleSchema,
    update: UpdateMaestroSimpleSchema,
  },
} satisfies Record<string, DefMaestro>;

export type TipoMaestro = keyof typeof MAESTROS;

export interface FiltroMaestro {
  vigente?: boolean;
  competenciaId?: string;
  // Solo materias: aplica al tipo de atención indicado.
  aplicaA?: TipoAtencion;
}

const COLUMNA_APLICA: Record<TipoAtencion, keyof MateriaRow> = {
  Consulta: "aplicaConsulta",
  Asesoria: "aplicaAsesoria",
  Juicio: "aplicaJuicio",
};

@Injectable()
export class MaestrosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private def(tipo: string): DefMaestro {
    const d = (MAESTROS as Record<string, DefMaestro>)[tipo];
    if (!d) throw new NotFoundException(`Maestro '${tipo}' no existe`);
    return d;
  }

  private cols(d: DefMaestro): Record<string, PgColumn> {
    return getTableColumns(d.table) as Record<string, PgColumn>;
  }

  private parse<T>(schema: ZodTypeAny, body: unknown): T {
    const r = schema.safeParse(body);
    if (!r.success) {
      throw new BadRequestException({ message: "Datos inválidos", errors: r.error.flatten().fieldErrors });
    }
    return r.data as T;
  }

  async listar(tipo: string, filtro: FiltroMaestro = {}) {
    const d = this.def(tipo);
    const c = this.cols(d);
    const condiciones: (SQL | undefined)[] = [
      filtro.vigente === undefined ? undefined : eq(c.vigente, filtro.vigente),
      d.porCompetencia && filtro.competenciaId ? eq(c.competenciaId, filtro.competenciaId) : undefined,
      tipo === "materias" && filtro.aplicaA ? eq(c[COLUMNA_APLICA[filtro.aplicaA]], true) : undefined,
    ];
    return this.db
      .select()
      .from(d.table)
      .where(and(...condiciones))
      .orderBy(asc(c.nombre));
  }

  async crear(tipo: string, body: unknown) {
    const d = this.def(tipo);
    const data = this.parse<Record<string, unknown>>(d.create, body);
    if (d.porCompetencia) await this.assertCompetencia(String(data.competenciaId));
    try {
      const [row] = await this.db.insert(d.table).values(data).returning();
      return row;
    } catch (err) {
      throw this.traducir(err, d, String(data.nombre ?? ""));
    }
  }

  async actualizar(tipo: string, id: string, body: unknown) {
    const d = this.def(tipo);
    const c = this.cols(d);
    const data = this.parse<Record<string, unknown>>(d.update, body);
    if (Object.keys(data).length === 0) throw new BadRequestException("Nada que actualizar");
    if (d.porCompetencia && data.competenciaId) await this.assertCompetencia(String(data.competenciaId));
    try {
      const [row] = await this.db.update(d.table).set(data).where(eq(c.id, id)).returning();
      if (!row) throw new NotFoundException(`No existe ${d.etiqueta} ${id}`);
      return row;
    } catch (err) {
      throw this.traducir(err, d, String(data.nombre ?? ""));
    }
  }

  async obtenerMateria(id: string): Promise<MateriaRow> {
    const [row] = await this.db.select().from(materias).where(eq(materias.id, id));
    if (!row) throw new NotFoundException(`Materia ${id} no existe`);
    return row;
  }

  private async assertCompetencia(id: string) {
    const [row] = await this.db.select({ id: competencias.id }).from(competencias).where(eq(competencias.id, id));
    if (!row) throw new BadRequestException(`Competencia ${id} no existe`);
  }

  private traducir(err: unknown, d: DefMaestro, nombre: string): unknown {
    if (esViolacionUnica(err)) return new ConflictException(`Ya existe ${d.etiqueta} '${nombre}'`);
    return err;
  }
}
