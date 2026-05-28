import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, between, eq } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { gestiones } from "../../db/schema/gestiones";
import { usuarios } from "../../db/schema/usuarios";
import { atenciones } from "../../db/schema/atenciones";
import { NotificacionesService } from "./notificaciones.service";

@Injectable()
export class VencimientosScheduler {
  private readonly logger = new Logger(VencimientosScheduler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // Cada día 08:00 UTC busca gestiones pendientes con compromiso en las próximas 24h.
  // En prod se podría reemplazar por EventBridge + Lambda para no acoplarse al API.
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async revisarVencimientos(): Promise<void> {
    const ahora = new Date();
    const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
    this.logger.log(`Revisando gestiones con compromiso entre ${ahora.toISOString()} y ${en24h.toISOString()}`);

    const pendientes = await this.db
      .select({
        gestionId: gestiones.id,
        titulo: gestiones.titulo,
        fechaCompromiso: gestiones.fechaCompromiso,
        responsableEmail: usuarios.email,
        correlativo: atenciones.correlativo,
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

    for (const row of pendientes) {
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
    }
    this.logger.log(`Procesadas ${pendientes.length} notificaciones de vencimiento`);
  }
}
