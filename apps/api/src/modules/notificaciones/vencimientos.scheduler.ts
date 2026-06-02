import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, between, eq, isNotNull, lt } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { gestiones } from "../../db/schema/gestiones";
import { usuarios } from "../../db/schema/usuarios";
import { atenciones } from "../../db/schema/atenciones";
import { NotificacionesService } from "./notificaciones.service";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";

@Injectable()
export class VencimientosScheduler {
  private readonly logger = new Logger(VencimientosScheduler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotificacionesService) private readonly notificaciones: NotificacionesService,
    @Inject(NotifInboxService) private readonly inbox: NotifInboxService,
  ) {}

  // Cada día 08:00 UTC: avisa gestiones que vencen en 24h (info) y las ya
  // vencidas que siguen Pendientes (critical). Email + notif persistente.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async revisarVencimientos(): Promise<void> {
    const ahora = new Date();
    const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
    this.logger.log(
      `Revisando gestiones con compromiso entre ${ahora.toISOString()} y ${en24h.toISOString()}`,
    );

    const porVencer = await this.db
      .select({
        gestionId: gestiones.id,
        titulo: gestiones.titulo,
        fechaCompromiso: gestiones.fechaCompromiso,
        responsableId: gestiones.responsableId,
        responsableEmail: usuarios.email,
        correlativo: atenciones.correlativo,
        atencionId: atenciones.id,
        codPlan: atenciones.codPlan,
      })
      .from(gestiones)
      .innerJoin(usuarios, eq(gestiones.responsableId, usuarios.id))
      .innerJoin(atenciones, eq(gestiones.atencionId, atenciones.id))
      .where(
        and(
          eq(gestiones.estado, "Pendiente"),
          between(gestiones.fechaCompromiso, ahora, en24h),
        ),
      );

    for (const row of porVencer) {
      await this.notificaciones.enviarEmail({
        to: [row.responsableEmail],
        subject: `Gestión por vencer: ${row.titulo} (${row.correlativo})`,
        bodyHtml: `
          <p>Recordatorio: la gestión "<strong>${row.titulo}</strong>" de la atención
          <strong>${row.correlativo}</strong> tiene compromiso para
          ${row.fechaCompromiso?.toISOString()}.</p>
          <p>Ingresa al sistema para completarla.</p>
        `,
        bodyText: `Gestión ${row.titulo} (${row.correlativo}) vence ${row.fechaCompromiso?.toISOString()}`,
      });
      await this.inbox.crearSiNoExisteUnseen(
        {
          codPlan: row.codPlan,
          usuarioId: row.responsableId,
          severidad: "warn",
          titulo: `Vence en 24h: ${row.titulo}`,
          detalle: `${row.correlativo} · ${row.fechaCompromiso?.toISOString().slice(0, 16).replace("T", " ")}`,
          accionUrl: `/atenciones/${row.atencionId}`,
          metadata: { gestionId: row.gestionId, tipo: "por_vencer" },
        },
        "gestionId",
        row.gestionId,
      );
    }

    const vencidas = await this.db
      .select({
        gestionId: gestiones.id,
        titulo: gestiones.titulo,
        fechaCompromiso: gestiones.fechaCompromiso,
        responsableId: gestiones.responsableId,
        correlativo: atenciones.correlativo,
        atencionId: atenciones.id,
        codPlan: atenciones.codPlan,
      })
      .from(gestiones)
      .innerJoin(atenciones, eq(gestiones.atencionId, atenciones.id))
      .where(
        and(
          eq(gestiones.estado, "Pendiente"),
          isNotNull(gestiones.fechaCompromiso),
          lt(gestiones.fechaCompromiso, ahora),
        ),
      );

    for (const row of vencidas) {
      await this.inbox.crearSiNoExisteUnseen(
        {
          codPlan: row.codPlan,
          usuarioId: row.responsableId,
          severidad: "critical",
          titulo: `Vencida: ${row.titulo}`,
          detalle: `${row.correlativo} · compromiso ${row.fechaCompromiso?.toISOString().slice(0, 10)}`,
          accionUrl: `/atenciones/${row.atencionId}`,
          metadata: { gestionId: row.gestionId, tipo: "vencida" },
        },
        "gestionId",
        row.gestionId,
      );
    }

    this.logger.log(
      `Notif: ${porVencer.length} por vencer, ${vencidas.length} vencidas`,
    );
  }
}
