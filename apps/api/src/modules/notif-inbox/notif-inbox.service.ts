import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { notificaciones, NuevaNotificacion, Notificacion } from "../../db/schema/notificaciones";

export interface CrearNotif {
  codPlan: string;
  usuarioId: string;
  severidad?: "info" | "warn" | "critical";
  titulo: string;
  detalle?: string;
  accionUrl?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotifInboxService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Crea notificación dirigida. Idempotencia recae en el caller; aquí no
  // dedupe porque dos eventos legítimos al mismo usuario son válidos.
  async crear(input: CrearNotif): Promise<Notificacion> {
    const payload: NuevaNotificacion = {
      codPlan: input.codPlan,
      usuarioId: input.usuarioId,
      severidad: input.severidad ?? "info",
      titulo: input.titulo,
      detalle: input.detalle ?? null,
      accionUrl: input.accionUrl ?? null,
      metadata: input.metadata ?? null,
    };
    const [row] = await this.db.insert(notificaciones).values(payload).returning();
    return row;
  }

  // Bulk: una sola query inserta varias notif. Útil cuando un evento
  // (ej. comité convocado) genera notif para N participantes.
  async crearBulk(items: CrearNotif[]): Promise<Notificacion[]> {
    if (items.length === 0) return [];
    return this.db
      .insert(notificaciones)
      .values(
        items.map((i) => ({
          codPlan: i.codPlan,
          usuarioId: i.usuarioId,
          severidad: i.severidad ?? "info",
          titulo: i.titulo,
          detalle: i.detalle ?? null,
          accionUrl: i.accionUrl ?? null,
          metadata: i.metadata ?? null,
        })),
      )
      .returning();
  }

  async inbox(
    usuarioId: string,
    opts: { page?: number; pageSize?: number; soloUnseen?: boolean } = {},
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 25, 100);
    const where = and(
      eq(notificaciones.usuarioId, usuarioId),
      opts.soloUnseen ? eq(notificaciones.seen, false) : undefined,
    );
    const [rows, [{ value: total }], [{ value: unseen }]] = await Promise.all([
      this.db
        .select()
        .from(notificaciones)
        .where(where)
        .orderBy(desc(notificaciones.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(notificaciones).where(where),
      this.db
        .select({ value: count() })
        .from(notificaciones)
        .where(and(eq(notificaciones.usuarioId, usuarioId), eq(notificaciones.seen, false))),
    ]);
    return {
      data: rows,
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
      unseen: Number(unseen),
    };
  }

  async marcarLeida(usuarioId: string, id: string): Promise<Notificacion> {
    const [row] = await this.db
      .update(notificaciones)
      .set({ seen: true, seenAt: new Date() })
      .where(and(eq(notificaciones.id, id), eq(notificaciones.usuarioId, usuarioId)))
      .returning();
    if (!row) throw new NotFoundException(`Notificación ${id} no existe`);
    return row;
  }

  async marcarTodasLeidas(usuarioId: string): Promise<{ marcadas: number }> {
    const rows = await this.db
      .update(notificaciones)
      .set({ seen: true, seenAt: new Date() })
      .where(and(eq(notificaciones.usuarioId, usuarioId), eq(notificaciones.seen, false)))
      .returning({ id: notificaciones.id });
    return { marcadas: rows.length };
  }

  async eliminar(usuarioId: string, ids: string[]): Promise<{ eliminadas: number }> {
    if (ids.length === 0) return { eliminadas: 0 };
    const rows = await this.db
      .delete(notificaciones)
      .where(and(eq(notificaciones.usuarioId, usuarioId), inArray(notificaciones.id, ids)))
      .returning({ id: notificaciones.id });
    return { eliminadas: rows.length };
  }
}
