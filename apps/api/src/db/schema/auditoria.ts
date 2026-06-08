import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Append-only log de cambios para cumplimiento normativo (Ley 19.628).
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorEmail: varchar("actor_email", { length: 200 }),
    accion: varchar("accion", { length: 60 }).notNull(),
    entidad: varchar("entidad", { length: 60 }).notNull(),
    entidadId: varchar("entidad_id", { length: 64 }).notNull(),
    codPlan: varchar("cod_plan", { length: 20 }),
    cambios: jsonb("cambios").$type<{ before?: unknown; after?: unknown }>(),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 250 }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entidadIdx: index("auditoria_entidad_idx").on(t.entidad, t.entidadId),
    actorIdx: index("auditoria_actor_idx").on(t.actorId),
    timestampIdx: index("auditoria_timestamp_idx").on(t.timestamp),
  }),
);

export type Auditoria = typeof auditoria.$inferSelect;
export type NuevaAuditoria = typeof auditoria.$inferInsert;
