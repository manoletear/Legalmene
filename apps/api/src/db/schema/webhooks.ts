import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { planes } from "./planes";

export const webhookEventoEnum = pgEnum("webhook_evento", [
  "atencion.creada",
  "atencion.derivada",
  "atencion.cerrada",
  "gestion.creada",
  "gestion.completada",
  "comite.convocado",
  "comite.cerrado",
  "pago.autorizado",
  "pago.rechazado",
  "afiliado.eliminado",
]);

// Una suscripción por (plan, url, evento). El secret se usa para firmar
// el payload con HMAC-SHA256 vía header X-Legalmene-Signature.
export const webhooksSuscripciones = pgTable(
  "webhooks_suscripciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "cascade" }),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    url: varchar("url", { length: 500 }).notNull(),
    secret: varchar("secret", { length: 128 }).notNull(),
    eventos: jsonb("eventos").$type<string[]>().notNull().default([]),
    activo: boolean("activo").notNull().default(true),
    headers: jsonb("headers").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planActivoIdx: index("webhooks_sus_plan_activo_idx").on(t.codPlan, t.activo),
  }),
);

export type WebhookSuscripcion = typeof webhooksSuscripciones.$inferSelect;
export type NuevoWebhookSuscripcion = typeof webhooksSuscripciones.$inferInsert;

// Entrega individual de un evento. append-only. Permite reintentos +
// auditoría de qué se mandó y qué respondió el endpoint.
export const webhookEntregasEstadoEnum = pgEnum("webhook_entrega_estado", [
  "Pendiente",
  "Enviada",
  "Fallida",
  "Reintentar",
]);

export const webhookEntregas = pgTable(
  "webhook_entregas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    suscripcionId: uuid("suscripcion_id")
      .notNull()
      .references(() => webhooksSuscripciones.id, { onDelete: "cascade" }),
    codPlan: varchar("cod_plan", { length: 20 }).notNull(),
    evento: varchar("evento", { length: 60 }).notNull(),
    payload: jsonb("payload").notNull(),
    estado: webhookEntregasEstadoEnum("estado").notNull().default("Pendiente"),
    intentos: integer("intentos").notNull().default(0),
    proximoReintento: timestamp("proximo_reintento", { withTimezone: true }),
    httpStatus: integer("http_status"),
    respuesta: text("respuesta"),
    ultimoError: text("ultimo_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    estadoIdx: index("webhook_entregas_estado_idx").on(t.estado, t.proximoReintento),
    susIdx: index("webhook_entregas_sus_idx").on(t.suscripcionId, t.createdAt),
  }),
);

export type WebhookEntrega = typeof webhookEntregas.$inferSelect;
