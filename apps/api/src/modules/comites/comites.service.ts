import { Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { comites, participantesComite, NuevoComite } from "../../db/schema/comites";
import { atenciones } from "../../db/schema/atenciones";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import type { ConvocarComite } from "@legalmene/shared";

@Injectable()
export class ComitesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
  ) {}

  async listarPorAtencion(codPlan: string, atencionId: string) {
    await this.assertAtencionEnPlan(codPlan, atencionId);
    return this.db.select().from(comites).where(eq(comites.atencionId, atencionId));
  }

  async convocar(codPlan: string, convocadoPor: string, input: ConvocarComite) {
    await this.assertAtencionEnPlan(codPlan, input.atencionId);

    return this.db.transaction(async (tx) => {
      const [comite] = await tx
        .insert(comites)
        .values({
          atencionId: input.atencionId,
          convocadoPor,
          motivo: input.motivo,
          fechaSesion: input.fechaSesion ? new Date(input.fechaSesion) : null,
        } satisfies NuevoComite)
        .returning();

      await tx.insert(participantesComite).values(
        input.participantesIds.map((usuarioId, idx) => ({
          comiteId: comite.id,
          usuarioId,
          rol: idx === 0 ? ("Presidente" as const) : ("Miembro" as const),
        })),
      );

      await tx
        .update(atenciones)
        .set({ estado: "EnComite", updatedAt: new Date() })
        .where(eq(atenciones.id, input.atencionId));

      return comite;
    }).then(async (comite) => {
      // Notif persistente a cada participante. Out-of-transaction
      // porque un error de inbox no debe abortar la convocatoria.
      await this.notif.crearBulk(
        input.participantesIds.map((usuarioId) => ({
          codPlan,
          usuarioId,
          severidad: "warn" as const,
          titulo: "Convocado a comité",
          detalle: input.motivo,
          accionUrl: `/atenciones/${input.atencionId}`,
          metadata: { comiteId: comite.id, atencionId: input.atencionId },
        })),
      );
      return comite;
    });
  }

  async votar(
    codPlan: string,
    comiteId: string,
    usuarioId: string,
    voto: "AFavor" | "EnContra" | "Abstencion",
    comentario?: string,
  ) {
    const [comite] = await this.db.select().from(comites).where(eq(comites.id, comiteId));
    if (!comite) throw new NotFoundException(`Comité ${comiteId} no existe`);
    await this.assertAtencionEnPlan(codPlan, comite.atencionId);
    if (comite.estado === "Cerrado" || comite.estado === "Cancelado") {
      throw new BadRequestException(`Comité ya está ${comite.estado}, no admite votos`);
    }
    const [updated] = await this.db
      .update(participantesComite)
      .set({ voto, comentario: comentario ?? null })
      .where(
        and(
          eq(participantesComite.comiteId, comiteId),
          eq(participantesComite.usuarioId, usuarioId),
        ),
      )
      .returning();
    if (!updated) {
      throw new BadRequestException("Usuario no es participante del comité");
    }
    return updated;
  }

  async cerrar(
    codPlan: string,
    comiteId: string,
    decision: "Aprobado" | "Rechazado" | "Diferido",
    acta: string,
  ) {
    const [comite] = await this.db.select().from(comites).where(eq(comites.id, comiteId));
    if (!comite) throw new NotFoundException(`Comité ${comiteId} no existe`);
    await this.assertAtencionEnPlan(codPlan, comite.atencionId);
    const [updated] = await this.db
      .update(comites)
      .set({
        estado: "Cerrado",
        decision,
        acta,
        fechaCierre: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(comites.id, comiteId))
      .returning();
    await this.db
      .update(atenciones)
      .set({ estado: "EnGestion", updatedAt: new Date() })
      .where(eq(atenciones.id, comite.atencionId));
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
