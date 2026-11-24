import { jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usuarios } from "./usuarios";

// Formato de cada búsqueda exportable (Anexo §XIII l.2207): títulos de columna en el orden elegido.
export const formatosExportacion = pgTable("formatos_exportacion", {
  clave: varchar("clave", { length: 40 }).primaryKey(),
  columnas: jsonb("columnas").$type<string[]>().notNull(),
  actualizadoPorId: uuid("actualizado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
