import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { planes } from "./planes";
import { usuarios } from "./usuarios";

export const notifSeveridadEnum = pgEnum("notif_severidad", ["info", "warn", "critical"]);

// Notificación dirigida a un usuario específico, distinta del resumen
// computado en /dashboard/notificaciones (ése era ad-hoc por KPI).
// Aquí cada item tiene seen flag + acción asociada (URL relativa front).
export const notificaciones = pgTable(
  "notificaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    severidad: notifSeveridadEnum("severidad").notNull().default("info"),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    detalle: text("detalle"),
    accionUrl: varchar("accion_url", { length: 500 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    seen: boolean("seen").notNull().default(false),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    usuarioSeenIdx: index("notif_usuario_seen_idx").on(t.usuarioId, t.seen, t.createdAt),
    planUsuarioIdx: index("notif_plan_usuario_idx").on(t.codPlan, t.usuarioId),
  }),
);

export type Notificacion = typeof notificaciones.$inferSelect;
export type NuevaNotificacion = typeof notificaciones.$inferInsert;
