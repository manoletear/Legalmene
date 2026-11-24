import { boolean, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { materias, procedimientos } from "./maestros";
import { tipoAtencionEnum } from "./enums";

// Campos que el administrador agrega para ciertas materias o procedimientos (Anexo §XIII l.2396).
// Desactivar oculta el campo en la ficha sin borrar los valores ya registrados.
export const camposAdicionales = pgTable(
  "campos_adicionales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    etiqueta: varchar("etiqueta", { length: 120 }).notNull(),
    tipoDato: varchar("tipo_dato", { length: 10 }).$type<"Texto" | "Numero" | "Fecha" | "Opcion" | "SiNo">().notNull(),
    opciones: jsonb("opciones").$type<string[]>(),
    obligatorio: boolean("obligatorio").notNull().default(false),
    tipoAtencion: tipoAtencionEnum("tipo_atencion"),
    materiaId: uuid("materia_id").references(() => materias.id, { onDelete: "restrict" }),
    procedimientoId: uuid("procedimiento_id").references(() => procedimientos.id, { onDelete: "restrict" }),
    orden: integer("orden").notNull().default(0),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    materiaIdx: index("campos_adicionales_materia_idx").on(t.materiaId),
    procedimientoIdx: index("campos_adicionales_procedimiento_idx").on(t.procedimientoId),
  }),
);
export type CampoAdicionalRow = typeof camposAdicionales.$inferSelect;
