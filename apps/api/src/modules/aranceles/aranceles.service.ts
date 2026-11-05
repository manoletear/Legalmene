import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNull, or, SQL } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { aranceles, Arancel, valoresUf, ValorUf } from "../../db/schema/aranceles";
import { competencias, materias } from "../../db/schema/maestros";
import { esViolacionUnica } from "../../common/utils/pg-errors";
import { ufCentesimasAClp } from "../coberturas/copago";
import type { CreateArancel, TipoAtencion, UpdateArancel, ValorUf as ValorUfInput } from "@legalmene/shared";

export interface FiltroAranceles {
  competenciaId?: string;
  materiaId?: string;
  soloVigentes?: boolean;
}

@Injectable()
export class ArancelesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async ufVigente(): Promise<ValorUf | null> {
    const [row] = await this.db.select().from(valoresUf).orderBy(desc(valoresUf.fecha)).limit(1);
    return row ?? null;
  }

  async registrarUf(input: ValorUfInput): Promise<ValorUf> {
    const [row] = await this.db
      .insert(valoresUf)
      .values(input)
      .onConflictDoUpdate({ target: valoresUf.fecha, set: { valorCentavos: input.valorCentavos } })
      .returning();
    return row;
  }

  async listar(filtro: FiltroAranceles = {}) {
    const condiciones: (SQL | undefined)[] = [
      filtro.competenciaId ? eq(materias.competenciaId, filtro.competenciaId) : undefined,
      filtro.materiaId ? eq(aranceles.materiaId, filtro.materiaId) : undefined,
      filtro.soloVigentes ? eq(aranceles.vigente, true) : undefined,
    ];
    const [rows, uf] = await Promise.all([
      this.db
        .select({
          arancel: aranceles,
          materiaNombre: materias.nombre,
          competenciaId: competencias.id,
          competenciaNombre: competencias.nombre,
        })
        .from(aranceles)
        .innerJoin(materias, eq(materias.id, aranceles.materiaId))
        .innerJoin(competencias, eq(competencias.id, materias.competenciaId))
        .where(and(...condiciones))
        .orderBy(asc(competencias.nombre), asc(materias.nombre), asc(aranceles.codigo)),
      this.ufVigente(),
    ]);
    return {
      uf,
      data: rows.map((r) => ({
        ...r.arancel,
        materiaNombre: r.materiaNombre,
        competenciaId: r.competenciaId,
        competenciaNombre: r.competenciaNombre,
        valorClp: ufCentesimasAClp(r.arancel.valorUfCentesimas, uf?.valorCentavos ?? null),
      })),
    };
  }

  // Arancel aplicable: el específico del tipo de atención o, si no hay, el de la materia.
  async aplicable(materiaId: string, tipo: TipoAtencion): Promise<Arancel | null> {
    const rows = await this.db
      .select()
      .from(aranceles)
      .where(
        and(
          eq(aranceles.materiaId, materiaId),
          eq(aranceles.vigente, true),
          or(eq(aranceles.tipo, tipo), isNull(aranceles.tipo)),
        ),
      );
    return rows.find((r) => r.tipo === tipo) ?? rows.find((r) => r.tipo === null) ?? null;
  }

  async obtener(id: string): Promise<Arancel> {
    const [row] = await this.db.select().from(aranceles).where(eq(aranceles.id, id));
    if (!row) throw new NotFoundException(`Arancel ${id} no existe`);
    return row;
  }

  async crear(input: CreateArancel): Promise<Arancel> {
    await this.assertMateria(input.materiaId);
    try {
      const [row] = await this.db
        .insert(aranceles)
        .values({ ...input, tipo: input.tipo ?? null })
        .returning();
      return row;
    } catch (err) {
      throw this.traducirDuplicado(err);
    }
  }

  async actualizar(id: string, patch: UpdateArancel): Promise<Arancel> {
    await this.obtener(id);
    if (patch.materiaId) await this.assertMateria(patch.materiaId);
    try {
      const [row] = await this.db
        .update(aranceles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(aranceles.id, id))
        .returning();
      return row;
    } catch (err) {
      throw this.traducirDuplicado(err);
    }
  }

  private async assertMateria(materiaId: string) {
    const [m] = await this.db.select({ id: materias.id }).from(materias).where(eq(materias.id, materiaId));
    if (!m) throw new BadRequestException(`Materia ${materiaId} no existe`);
  }

  private traducirDuplicado(err: unknown): unknown {
    if (esViolacionUnica(err)) {
      return new ConflictException("Ya existe un arancel con ese código o para esa materia y tipo de atención");
    }
    return err;
  }
}
