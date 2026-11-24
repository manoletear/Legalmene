import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
  date,
} from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";

export const estadoComiteEnum = pgEnum("estado_comite", [
  "Convocado",
  "EnSesion",
  "Cerrado",
  "Cancelado",
]);
export const decisionComiteEnum = pgEnum("decision_comite", [
  "Aprobado",
  "Rechazado",
  "Pendiente",
  "Diferido",
]);
export const rolParticipanteEnum = pgEnum("rol_participante_comite", [
  "Presidente",
  "Miembro",
  "Secretario",
  "Observador",
]);
export const votoComiteEnum = pgEnum("voto_comite", [
  "AFavor",
  "EnContra",
  "Abstencion",
  "Pendiente",
]);

export const comites = pgTable(
  "comites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "cascade" }),
    estado: estadoComiteEnum("estado").notNull().default("Convocado"),
    decision: decisionComiteEnum("decision").notNull().default("Pendiente"),
    fechaConvocatoria: timestamp("fecha_convocatoria", { withTimezone: true }).notNull().defaultNow(),
    fechaSesion: timestamp("fecha_sesion", { withTimezone: true }),
    fechaCierre: timestamp("fecha_cierre", { withTimezone: true }),
    convocadoPor: uuid("convocado_por")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    motivo: text("motivo").notNull(),
    acta: text("acta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionIdx: index("comites_atencion_idx").on(t.atencionId),
    estadoIdx: index("comites_estado_idx").on(t.estado),
  }),
);

export const participantesComite = pgTable("participantes_comite", {
  id: uuid("id").primaryKey().defaultRandom(),
  comiteId: uuid("comite_id")
    .notNull()
    .references(() => comites.id, { onDelete: "cascade" }),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "restrict" }),
  rol: rolParticipanteEnum("rol").notNull(),
  voto: votoComiteEnum("voto").notNull().default("Pendiente"),
  comentario: text("comentario"),
});

export type Comite = typeof comites.$inferSelect;
export type NuevoComite = typeof comites.$inferInsert;
export type ParticipanteComite = typeof participantesComite.$inferSelect;

export const estadoCompromisoEnum = pgEnum("estado_compromiso", ["Pendiente", "Cumplido", "NoCumplido"]);

// Bitácora del comité (Anexo §VII l.951, §VIII l.1142): compromiso con responsable y fecha; se
// valida en el comité siguiente de la misma atención (validado_en_comite_id).
export const compromisosComite = pgTable(
  "compromisos_comite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    comiteId: uuid("comite_id")
      .notNull()
      .references(() => comites.id, { onDelete: "cascade" }),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "cascade" }),
    descripcion: text("descripcion").notNull(),
    responsableId: uuid("responsable_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    fechaCompromiso: date("fecha_compromiso", { mode: "string" }).notNull(),
    estado: estadoCompromisoEnum("estado").notNull().default("Pendiente"),
    validadoEnComiteId: uuid("validado_en_comite_id").references(() => comites.id, { onDelete: "set null" }),
    validadoPorId: uuid("validado_por_id").references(() => usuarios.id, { onDelete: "restrict" }),
    validadoAt: timestamp("validado_at", { withTimezone: true }),
    observacion: text("observacion"),
    creadoPorId: uuid("creado_por_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    comiteIdx: index("compromisos_comite_comite_idx").on(t.comiteId),
    atencionEstadoIdx: index("compromisos_comite_atencion_estado_idx").on(t.atencionId, t.estado),
  }),
);
export type CompromisoComiteRow = typeof compromisosComite.$inferSelect;
