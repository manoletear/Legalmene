import { Injectable, Inject, NotFoundException, ConflictException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { planes, Plan, NuevoPlan } from "../../db/schema/planes";

@Injectable()
export class PlanesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listar(): Promise<Plan[]> {
    return this.db.select().from(planes).orderBy(planes.codPlan);
  }

  async obtener(codPlan: string): Promise<Plan> {
    const [row] = await this.db.select().from(planes).where(eq(planes.codPlan, codPlan));
    if (!row) throw new NotFoundException(`Plan ${codPlan} no existe`);
    return row;
  }

  async crear(input: NuevoPlan): Promise<Plan> {
    const existing = await this.db
      .select({ codPlan: planes.codPlan })
      .from(planes)
      .where(eq(planes.codPlan, input.codPlan));
    if (existing.length > 0) throw new ConflictException(`Plan ${input.codPlan} ya existe`);
    const [row] = await this.db.insert(planes).values(input).returning();
    return row;
  }

  async actualizar(codPlan: string, patch: Partial<NuevoPlan>): Promise<Plan> {
    const [row] = await this.db
      .update(planes)
      .set(patch)
      .where(eq(planes.codPlan, codPlan))
      .returning();
    if (!row) throw new NotFoundException(`Plan ${codPlan} no existe`);
    return row;
  }
}
