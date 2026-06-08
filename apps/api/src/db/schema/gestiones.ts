import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";

export const tipoGestionEnum = pgEnum("tipo_gestion", [
  "LlamadaTelefonica",
  "Email",
  "Reunion",
  "EscritoJudicial",
  "Audiencia",
  "Notificacion",
  "AnalisisDocumental",
  "Resolucion",
  "Otra",
]);
export const estadoGestionEnum = pgEnum("estado_gestion", [
  "Pendiente",
  "Completada",
  "Vencida",
  "Cancelada",
]);

export const gestiones = pgTable(
  "gestiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "cascade" }),
    tipo: tipoGestionEnum("tipo").notNull(),
    estado: estadoGestionEnum("estado").notNull().default("Pendiente"),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    detalle: text("detalle"),
    responsableId: uuid("responsable_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    fechaProgramada: timestamp("fecha_programada", { withTimezone: true }),
    fechaCompromiso: timestamp("fecha_compromiso", { withTimezone: true }),
    fechaEjecucion: timestamp("fecha_ejecucion", { withTimezone: true }),
    resultado: text("resultado"),
    documentosIds: jsonb("documentos_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionEstadoIdx: index("gestiones_atencion_estado_idx").on(t.atencionId, t.estado),
    compromisoIdx: index("gestiones_compromiso_idx").on(t.fechaCompromiso),
    responsableIdx: index("gestiones_responsable_idx").on(t.responsableId, t.estado),
  }),
);

export type Gestion = typeof gestiones.$inferSelect;
export type NuevaGestion = typeof gestiones.$inferInsert;
