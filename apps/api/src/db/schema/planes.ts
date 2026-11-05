import { pgTable, uuid, varchar, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const canales = pgTable(
  "canales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nombreUq: uniqueIndex("canales_nombre_uq").on(t.nombre),
  }),
);

export type Canal = typeof canales.$inferSelect;

// Plan = producto contratado (no es tenant). Un RUT puede tener varios (planes_afiliado).
export const planes = pgTable("planes", {
  codPlan: varchar("cod_plan", { length: 20 }).primaryKey(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  descripcion: text("descripcion"),
  canalId: uuid("canal_id").references(() => canales.id, { onDelete: "set null" }),
  vigente: boolean("vigente").notNull().default(true),
  fechaCreacion: timestamp("fecha_creacion", { withTimezone: true }).notNull().defaultNow(),
});

export type Plan = typeof planes.$inferSelect;
export type NuevoPlan = typeof planes.$inferInsert;
