import { Injectable, Inject, NotFoundException, ConflictException } from "@nestjs/common";
import { and, count, eq } from "drizzle-orm";
import type { CreatePlan, PlanResumen, UpdatePlan } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { planes, Plan } from "../../db/schema/planes";
import { coberturas } from "../../db/schema/aranceles";
import { planProductoVigenteSql } from "../afiliados/vigencia";

@Injectable()
export class PlanesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Catálogo con el estado efectivo de hoy y el número de reglas de cobertura vigentes.
  async listar(): Promise<PlanResumen[]> {
    const rows = await this.db
      .select({ plan: planes, vigenteHoy: planProductoVigenteSql, coberturas: count(coberturas.id) })
      .from(planes)
      .leftJoin(coberturas, and(eq(coberturas.codPlan, planes.codPlan), eq(coberturas.vigente, true)))
      .groupBy(planes.codPlan)
      .orderBy(planes.codPlan);
    return rows.map((r) => ({
      ...r.plan,
      fechaCreacion: r.plan.fechaCreacion.toISOString(),
      vigenteHoy: Boolean(r.vigenteHoy),
      coberturas: Number(r.coberturas),
    }));
  }

  async obtener(codPlan: string): Promise<Plan> {
    const [row] = await this.db.select().from(planes).where(eq(planes.codPlan, codPlan));
    if (!row) throw new NotFoundException(`Plan ${codPlan} no existe`);
    return row;
  }

  async crear(input: CreatePlan): Promise<Plan> {
    const [row] = await this.db
      .insert(planes)
      .values({ ...input, fechaTermino: input.fechaTermino ?? null })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException(`Plan ${input.codPlan} ya existe`);
    return row;
  }

  async actualizar(codPlan: string, patch: UpdatePlan): Promise<Plan> {
    // Sin campos editables (p. ej. solo codPlan, que no cambia) no hay nada que escribir.
    if (Object.keys(patch).length === 0) return this.obtener(codPlan);
    const [row] = await this.db
      .update(planes)
      .set(patch)
      .where(eq(planes.codPlan, codPlan))
      .returning();
    if (!row) throw new NotFoundException(`Plan ${codPlan} no existe`);
    return row;
  }
}

