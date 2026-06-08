import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { DRIZZLE, Database } from "../../db/database.module";
import {
  webhooksSuscripciones,
  webhookEntregas,
  NuevoWebhookSuscripcion,
  WebhookSuscripcion,
} from "../../db/schema/webhooks";

export interface CrearWebhook {
  nombre: string;
  url: string;
  eventos: string[];
  headers?: Record<string, string>;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listar(codPlan: string) {
    return this.db
      .select()
      .from(webhooksSuscripciones)
      .where(eq(webhooksSuscripciones.codPlan, codPlan))
      .orderBy(desc(webhooksSuscripciones.createdAt));
  }

  async crear(codPlan: string, input: CrearWebhook): Promise<WebhookSuscripcion> {
    const secret = randomBytes(32).toString("hex");
    const payload: NuevoWebhookSuscripcion = {
      codPlan,
      nombre: input.nombre,
      url: input.url,
      eventos: input.eventos,
      headers: input.headers ?? null,
      secret,
    };
    const [row] = await this.db.insert(webhooksSuscripciones).values(payload).returning();
    return row;
  }

  async actualizar(
    codPlan: string,
    id: string,
    patch: Partial<CrearWebhook> & { activo?: boolean },
  ): Promise<WebhookSuscripcion> {
    const [row] = await this.db
      .update(webhooksSuscripciones)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(webhooksSuscripciones.id, id), eq(webhooksSuscripciones.codPlan, codPlan)))
      .returning();
    if (!row) throw new NotFoundException(`Webhook ${id} no existe`);
    return row;
  }

  async eliminar(codPlan: string, id: string): Promise<void> {
    await this.db
      .delete(webhooksSuscripciones)
      .where(and(eq(webhooksSuscripciones.id, id), eq(webhooksSuscripciones.codPlan, codPlan)));
  }

  // Encola una entrega para cada suscripción activa que escucha el evento.
  // El dispatcher (scheduler o invocación inmediata) procesa la cola.
  async emitir(codPlan: string, evento: string, payload: Record<string, unknown>): Promise<void> {
    const subs = await this.db
      .select()
      .from(webhooksSuscripciones)
      .where(
        and(
          eq(webhooksSuscripciones.codPlan, codPlan),
          eq(webhooksSuscripciones.activo, true),
        ),
      );
    const matching = subs.filter((s) => s.eventos.includes(evento));
    if (matching.length === 0) return;

    await this.db.insert(webhookEntregas).values(
      matching.map((s) => ({
        suscripcionId: s.id,
        codPlan,
        evento,
        payload,
        estado: "Pendiente" as const,
        proximoReintento: new Date(),
      })),
    );
    this.logger.log(`webhook encolado evento=${evento} plan=${codPlan} entregas=${matching.length}`);
  }

  async entregas(codPlan: string, opts: { page?: number; pageSize?: number; estado?: string } = {}) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    const where = and(
      eq(webhookEntregas.codPlan, codPlan),
      opts.estado ? eq(webhookEntregas.estado, opts.estado as "Pendiente") : undefined,
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(webhookEntregas)
        .where(where)
        .orderBy(desc(webhookEntregas.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(webhookEntregas).where(where),
    ]);
    return { data: rows, page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) };
  }

  // Reintento manual: vuelve a marcar Pendiente con proximoReintento=now,
  // sin resetear el contador. El dispatcher la recoge en el próximo tick.
  async reintentar(codPlan: string, entregaId: string) {
    const [row] = await this.db
      .update(webhookEntregas)
      .set({
        estado: "Pendiente",
        proximoReintento: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(webhookEntregas.id, entregaId), eq(webhookEntregas.codPlan, codPlan)),
      )
      .returning();
    if (!row) throw new NotFoundException(`Entrega ${entregaId} no existe`);
    return row;
  }
}
