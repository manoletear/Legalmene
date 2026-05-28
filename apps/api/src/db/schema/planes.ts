import { pgTable, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

// CodPlan funciona como tenant_id en la arquitectura multi-tenant.
export const planes = pgTable("planes", {
  codPlan: varchar("cod_plan", { length: 20 }).primaryKey(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  descripcion: text("descripcion"),
  vigente: boolean("vigente").notNull().default(true),
  fechaCreacion: timestamp("fecha_creacion", { withTimezone: true }).notNull().defaultNow(),
});

export type Plan = typeof planes.$inferSelect;
export type NuevoPlan = typeof planes.$inferInsert;
