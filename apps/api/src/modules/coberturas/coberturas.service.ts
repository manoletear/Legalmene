import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, SQL, sql } from "drizzle-orm";
import type { CopagoResultado, CreateCobertura, TipoAtencion, UpdateCobertura } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { coberturas, CoberturaRow } from "../../db/schema/aranceles";
import { competencias, materias } from "../../db/schema/maestros";
import { planes } from "../../db/schema/planes";
import { atenciones } from "../../db/schema/atenciones";
import { esViolacionUnica } from "../../common/utils/pg-errors";
import { ArancelesService } from "../aranceles/aranceles.service";
import { calcularCopago } from "./copago";

@Injectable()
export class CoberturasService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ArancelesService) private readonly aranceles: ArancelesService,
  ) {}

  async listar(filtro: { codPlan?: string; vigente?: boolean } = {}) {
    const condiciones: (SQL | undefined)[] = [
      filtro.codPlan ? eq(coberturas.codPlan, filtro.codPlan) : undefined,
      filtro.vigente === undefined ? undefined : eq(coberturas.vigente, filtro.vigente),
    ];
    const rows = await this.db
      .select({ cobertura: coberturas, materiaNombre: materias.nombre, competenciaNombre: competencias.nombre })
      .from(coberturas)
      .leftJoin(materias, eq(materias.id, coberturas.materiaId))
      .leftJoin(competencias, eq(competencias.id, materias.competenciaId))
      .where(and(...condiciones))
      // Reglas generales primero, luego por materia.
      .orderBy(asc(coberturas.codPlan), sql`${coberturas.materiaId} IS NOT NULL`, asc(materias.nombre), asc(coberturas.tipo));
    return rows.map((r) => ({ ...r.cobertura, materiaNombre: r.materiaNombre, competenciaNombre: r.competenciaNombre }));
  }

  async crear(input: CreateCobertura): Promise<CoberturaRow> {
    const [plan] = await this.db.select({ c: planes.codPlan }).from(planes).where(eq(planes.codPlan, input.codPlan));
    if (!plan) throw new BadRequestException(`Plan ${input.codPlan} no existe`);
    if (input.materiaId) await this.assertMateria(input.materiaId);
    try {
      const [row] = await this.db.insert(coberturas).values(this.normalizar(input)).returning();
      return row;
    } catch (err) {
      throw this.traducir(err);
    }
  }

  async actualizar(id: string, patch: UpdateCobertura): Promise<CoberturaRow> {
    const [actual] = await this.db.select().from(coberturas).where(eq(coberturas.id, id));
    if (!actual) throw new NotFoundException(`Cobertura ${id} no existe`);
    const merged = this.normalizar({ ...actual, ...patch });
    if (merged.modalidad === "Porcentaje" && merged.porcentaje === null) {
      throw new BadRequestException("Porcentaje requerido");
    }
    if (merged.modalidad === "ValorUF" && merged.valorUfCentesimas === null) {
      throw new BadRequestException("Valor UF requerido");
    }
    const [row] = await this.db
      .update(coberturas)
      .set({ ...merged, vigente: patch.vigente ?? actual.vigente, updatedAt: new Date() })
      .where(eq(coberturas.id, id))
      .returning();
    return row;
  }

  async copago(codPlan: string, materiaId: string, tipo: TipoAtencion): Promise<CopagoResultado> {
    const [arancel, reglas, uf] = await Promise.all([
      this.aranceles.aplicable(materiaId, tipo),
      this.db
        .select()
        .from(coberturas)
        .where(and(eq(coberturas.codPlan, codPlan), eq(coberturas.vigente, true))),
      this.aranceles.ufVigente(),
    ]);
    return calcularCopago({ arancel, coberturas: reglas, materiaId, tipo, ufCentavos: uf?.valorCentavos ?? null });
  }

  async copagoAtencion(atencionId: string): Promise<CopagoResultado & { codPlan: string }> {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan, materiaId: atenciones.materiaId, tipo: atenciones.tipo })
      .from(atenciones)
      .where(eq(atenciones.id, atencionId));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return { codPlan: a.codPlan, ...(await this.copago(a.codPlan, a.materiaId, a.tipo)) };
  }

  // Solo se guarda el valor que corresponde a la modalidad.
  private normalizar(c: {
    codPlan: string;
    materiaId?: string | null;
    tipo?: TipoAtencion | null;
    modalidad: CoberturaRow["modalidad"];
    porcentaje?: number | null;
    valorUfCentesimas?: number | null;
  }) {
    return {
      codPlan: c.codPlan,
      materiaId: c.materiaId ?? null,
      tipo: c.tipo ?? null,
      modalidad: c.modalidad,
      porcentaje: c.modalidad === "Porcentaje" ? (c.porcentaje ?? null) : null,
      valorUfCentesimas: c.modalidad === "ValorUF" ? (c.valorUfCentesimas ?? null) : null,
    };
  }

  private async assertMateria(materiaId: string) {
    const [m] = await this.db.select({ id: materias.id }).from(materias).where(eq(materias.id, materiaId));
    if (!m) throw new BadRequestException(`Materia ${materiaId} no existe`);
  }

  private traducir(err: unknown): unknown {
    if (esViolacionUnica(err)) {
      return new ConflictException("El plan ya tiene una regla de cobertura para esa materia y tipo de atención");
    }
    return err;
  }
}
