import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";
import { materias, procedimientos } from "./maestros";

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

// Gestiones predefinidas por materia o procedimiento, con orden y plazo (Anexo §XIV).
export const gestionesPlantilla = pgTable(
  "gestiones_plantilla",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materiaId: uuid("materia_id").references(() => materias.id, { onDelete: "restrict" }),
    procedimientoId: uuid("procedimiento_id").references(() => procedimientos.id, { onDelete: "restrict" }),
    orden: integer("orden").notNull(),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    tipo: tipoGestionEnum("tipo").notNull(),
    plazoDiasHabiles: integer("plazo_dias_habiles").notNull(),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    materiaIdx: index("gestiones_plantilla_materia_idx").on(t.materiaId),
    procedimientoIdx: index("gestiones_plantilla_procedimiento_idx").on(t.procedimientoId),
  }),
);
export type GestionPlantillaRow = typeof gestionesPlantilla.$inferSelect;

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
    // Gestión instanciada desde una plantilla (evita duplicarla en la misma atención).
    plantillaId: uuid("plantilla_id").references(() => gestionesPlantilla.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionEstadoIdx: index("gestiones_atencion_estado_idx").on(t.atencionId, t.estado),
    compromisoIdx: index("gestiones_compromiso_idx").on(t.fechaCompromiso),
    responsableIdx: index("gestiones_responsable_idx").on(t.responsableId, t.estado),
    plantillaUq: uniqueIndex("gestiones_atencion_plantilla_uq").on(t.atencionId, t.plantillaId),
  }),
);

export type Gestion = typeof gestiones.$inferSelect;
export type NuevaGestion = typeof gestiones.$inferInsert;
