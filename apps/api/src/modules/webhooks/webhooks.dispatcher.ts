import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { DRIZZLE, Database } from "../../db/database.module";
import { webhookEntregas, webhooksSuscripciones } from "../../db/schema/webhooks";

// Reintentos con backoff exponencial: 1m, 5m, 15m, 60m, 4h, 16h. 6 intentos.
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 3_600_000, 16 * 3_600_000];

@Injectable()
export class WebhooksDispatcher {
  private readonly logger = new Logger(WebhooksDispatcher.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Polling cada 30s: toma entregas Pendiente o Reintentar con
  // proximoReintento <= now y dispara HTTP POST hacia su suscripción.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async procesar() {
    const ahora = new Date();
    const pendientes = await this.db
      .select({
        id: webhookEntregas.id,
        suscripcionId: webhookEntregas.suscripcionId,
        evento: webhookEntregas.evento,
        payload: webhookEntregas.payload,
        intentos: webhookEntregas.intentos,
        url: webhooksSuscripciones.url,
        secret: webhooksSuscripciones.secret,
        headers: webhooksSuscripciones.headers,
        activo: webhooksSuscripciones.activo,
      })
      .from(webhookEntregas)
      .innerJoin(
        webhooksSuscripciones,
        eq(webhookEntregas.suscripcionId, webhooksSuscripciones.id),
      )
      .where(
        and(
          or(
            eq(webhookEntregas.estado, "Pendiente"),
            eq(webhookEntregas.estado, "Reintentar"),
          ),
          lte(webhookEntregas.proximoReintento, ahora),
        ),
      )
      .orderBy(asc(webhookEntregas.proximoReintento))
      .limit(50);

    if (pendientes.length === 0) return;

    await Promise.all(pendientes.map((p) => this.entregar(p)));
  }

  private async entregar(p: {
    id: string;
    suscripcionId: string;
    evento: string;
    payload: unknown;
    intentos: number;
    url: string;
    secret: string;
    headers: Record<string, string> | null;
    activo: boolean;
  }) {
    if (!p.activo) {
      // Suscripción desactivada: marcar como fallida sin reintentar.
      await this.marcarFallida(p.id, "Suscripción desactivada");
      return;
    }
    const body = JSON.stringify({ evento: p.evento, payload: p.payload, deliveredAt: new Date().toISOString() });
    const signature = createHmac("sha256", p.secret).update(body).digest("hex");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Legalmene-Signature": signature,
      "X-Legalmene-Event": p.evento,
      ...(p.headers ?? {}),
    };

    let httpStatus = 0;
    let respuesta = "";
    let error = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(p.url, { method: "POST", headers, body, signal: controller.signal });
      clearTimeout(timeout);
      httpStatus = res.status;
      respuesta = (await res.text()).slice(0, 2000);
      if (res.ok) {
        await this.marcarEnviada(p.id, httpStatus, respuesta);
        return;
      }
      error = `HTTP ${httpStatus}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const intentos = p.intentos + 1;
    if (intentos >= BACKOFF_MS.length) {
      await this.marcarFallida(p.id, error, httpStatus, respuesta);
      this.logger.warn(`webhook ${p.id} fallida tras ${intentos} intentos: ${error}`);
      return;
    }
    const proximoReintento = new Date(Date.now() + BACKOFF_MS[intentos]);
    await this.db
      .update(webhookEntregas)
      .set({
        estado: "Reintentar",
        intentos,
        proximoReintento,
        httpStatus: httpStatus || null,
        respuesta: respuesta || null,
        ultimoError: error,
        updatedAt: new Date(),
      })
      .where(eq(webhookEntregas.id, p.id));
  }

  private async marcarEnviada(id: string, httpStatus: number, respuesta: string) {
    await this.db
      .update(webhookEntregas)
      .set({
        estado: "Enviada",
        httpStatus,
        respuesta,
        ultimoError: null,
        updatedAt: new Date(),
      })
      .where(eq(webhookEntregas.id, id));
  }

  private async marcarFallida(id: string, error: string, httpStatus?: number, respuesta?: string) {
    await this.db
      .update(webhookEntregas)
      .set({
        estado: "Fallida",
        httpStatus: httpStatus ?? null,
        respuesta: respuesta ?? null,
        ultimoError: error,
        updatedAt: new Date(),
      })
      .where(eq(webhookEntregas.id, id));
  }
}
