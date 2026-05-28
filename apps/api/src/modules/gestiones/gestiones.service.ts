import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { gestiones, NuevaGestion, Gestion } from "../../db/schema/gestiones";
import { atenciones } from "../../db/schema/atenciones";
import type { CreateGestion, CompletarGestion } from "@legalmene/shared";

@Injectable()
export class GestionesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listarPorAtencion(codPlan: string, atencionId: string): Promise<Gestion[]> {
    await this.assertAtencionEnPlan(codPlan, atencionId);
    return this.db.select().from(gestiones).where(eq(gestiones.atencionId, atencionId));
  }

  async crear(codPlan: string, input: CreateGestion): Promise<Gestion> {
    await this.assertAtencionEnPlan(codPlan, input.atencionId);
    const payload: NuevaGestion = {
      atencionId: input.atencionId,
      tipo: input.tipo,
      estado: input.estado ?? "Pendiente",
      titulo: input.titulo,
      detalle: input.detalle ?? null,
      responsableId: input.responsableId,
      fechaProgramada: input.fechaProgramada ? new Date(input.fechaProgramada) : null,
      fechaCompromiso: input.fechaCompromiso ? new Date(input.fechaCompromiso) : null,
      documentosIds: input.documentosIds ?? [],
    };
    const [row] = await this.db.insert(gestiones).values(payload).returning();
    // Actualizar fechaUltimaGestion + estado de la atención.
    await this.db
      .update(atenciones)
      .set({ fechaUltimaGestion: new Date(), estado: "EnGestion", updatedAt: new Date() })
      .where(eq(atenciones.id, input.atencionId));
    return row;
  }

  async completar(codPlan: string, gestionId: string, input: CompletarGestion): Promise<Gestion> {
    const [row] = await this.db.select().from(gestiones).where(eq(gestiones.id, gestionId));
    if (!row) throw new NotFoundException(`Gestión ${gestionId} no existe`);
    await this.assertAtencionEnPlan(codPlan, row.atencionId);
    const [updated] = await this.db
      .update(gestiones)
      .set({
        estado: "Completada",
        fechaEjecucion: new Date(),
        resultado: input.resultado,
        documentosIds: input.documentosIds ?? row.documentosIds,
        updatedAt: new Date(),
      })
      .where(eq(gestiones.id, gestionId))
      .returning();
    await this.db
      .update(atenciones)
      .set({ fechaUltimaGestion: new Date(), updatedAt: new Date() })
      .where(eq(atenciones.id, row.atencionId));
    return updated;
  }

  private async assertAtencionEnPlan(codPlan: string, atencionId: string) {
    const [a] = await this.db
      .select({ id: atenciones.id })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), eq(atenciones.codPlan, codPlan)));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe en plan ${codPlan}`);
  }
}
