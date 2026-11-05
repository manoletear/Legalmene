import { Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
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

  async listarPorAtencion(atencionId: string) {
    await this.planDeAtencion(atencionId);
    return this.db.select().from(comites).where(eq(comites.atencionId, atencionId));
  }

  async convocar(convocadoPor: string, input: ConvocarComite) {
    const codPlan = await this.planDeAtencion(input.atencionId);

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

      // Solo un caso en trabajo pasa a comité; las consultas y los casos en espera no cambian.
      await tx
        .update(atenciones)
        .set({ estado: "EnComite", updatedAt: new Date() })
        .where(and(eq(atenciones.id, input.atencionId), inArray(atenciones.estado, ["Pendiente", "EnGestion"])));

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
    comiteId: string,
    usuarioId: string,
    voto: "AFavor" | "EnContra" | "Abstencion",
    comentario?: string,
  ) {
    const [comite] = await this.db.select().from(comites).where(eq(comites.id, comiteId));
    if (!comite) throw new NotFoundException(`Comité ${comiteId} no existe`);
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
    comiteId: string,
    decision: "Aprobado" | "Rechazado" | "Diferido",
    acta: string,
  ) {
    const [comite] = await this.db.select().from(comites).where(eq(comites.id, comiteId));
    if (!comite) throw new NotFoundException(`Comité ${comiteId} no existe`);
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
      .where(and(eq(atenciones.id, comite.atencionId), eq(atenciones.estado, "EnComite")));
    return updated;
  }

  // Devuelve el plan bajo el cual se registró la atención (usado en notificaciones).
  private async planDeAtencion(atencionId: string): Promise<string> {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan })
      .from(atenciones)
      .where(eq(atenciones.id, atencionId));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return a.codPlan;
  }
}
