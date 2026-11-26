import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Marca de sincronización con OpenSearch por entidad: lo modificado después ya se indexó.
export const busquedaIndexado = pgTable("busqueda_indexado", {
  entidad: varchar("entidad", { length: 30 }).primaryKey(),
  indexadoHasta: timestamp("indexado_hasta", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
