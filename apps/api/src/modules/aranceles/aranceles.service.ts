import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { aranceles, Arancel, valoresUf, ValorUf } from "../../db/schema/aranceles";
import type { CreateArancel, UpdateArancel, ValorUf as ValorUfInput } from "@legalmene/shared";

export interface FiltroAranceles {
  competencia?: Arancel["competencia"];
  codPlan?: string;
  soloVigentes?: boolean;
}

export function valorClp(valorUfCentesimas: number, ufCentavos: number | null): number | null {
  if (ufCentavos == null) return null;
  return Math.round((valorUfCentesimas * ufCentavos) / 10_000);
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
    const [rows, uf] = await Promise.all([
      this.db
        .select()
        .from(aranceles)
        .where(
          and(
            filtro.codPlan ? eq(aranceles.codPlan, filtro.codPlan) : undefined,
            filtro.competencia ? eq(aranceles.competencia, filtro.competencia) : undefined,
            filtro.soloVigentes ? eq(aranceles.vigente, true) : undefined,
          ),
        )
        .orderBy(asc(aranceles.codigo)),
      this.ufVigente(),
    ]);
    return {
      uf,
      data: rows.map((r) => ({ ...r, valorClp: valorClp(r.valorUfCentesimas, uf?.valorCentavos ?? null) })),
    };
  }

  async obtener(id: string): Promise<Arancel> {
    const [row] = await this.db
      .select()
      .from(aranceles)
      .where(eq(aranceles.id, id));
    if (!row) throw new NotFoundException(`Arancel ${id} no existe`);
    return row;
  }

  async crear(codPlan: string, input: CreateArancel): Promise<Arancel> {
    try {
      const [row] = await this.db
        .insert(aranceles)
        .values({ ...input, codPlan })
        .returning();
      return row;
    } catch (err) {
      throw this.traducirDuplicado(err, input.codigo);
    }
  }

  async actualizar(id: string, patch: UpdateArancel): Promise<Arancel> {
    await this.obtener(id);
    try {
      const [row] = await this.db
        .update(aranceles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(aranceles.id, id))
        .returning();
      return row;
    } catch (err) {
      throw this.traducirDuplicado(err, patch.codigo);
    }
  }

  private traducirDuplicado(err: unknown, codigo?: string): unknown {
    const pgCode = (err as { code?: string; cause?: { code?: string } }).code
      ?? (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      return new ConflictException(`Ya existe un arancel con código ${codigo} en este plan`);
    }
    return err;
  }
}
