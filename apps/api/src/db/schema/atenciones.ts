import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { planes } from "./planes";
import { afiliados } from "./afiliados";
import { usuarios } from "./usuarios";

export const tipoAtencionEnum = pgEnum("tipo_atencion", ["Consulta", "Asesoria", "Juicio"]);
export const estadoAtencionEnum = pgEnum("estado_atencion", [
  "Abierta",
  "EnGestion",
  "EnComite",
  "Suspendida",
  "Cerrada",
  "Archivada",
]);
export const competenciaEnum = pgEnum("competencia", [
  "Civil",
  "Penal",
  "Laboral",
  "Familia",
  "Tributario",
  "Comercial",
  "Administrativo",
  "Constitucional",
  "Otro",
]);
export const prioridadEnum = pgEnum("prioridad", ["Baja", "Media", "Alta", "Urgente"]);

export const atenciones = pgTable(
  "atenciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Correlativo legible al usuario: ej. "CONS-2026-000123".
    correlativo: varchar("correlativo", { length: 32 }).notNull().unique(),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    afiliadoId: uuid("afiliado_id")
      .notNull()
      .references(() => afiliados.id, { onDelete: "restrict" }),
    tipo: tipoAtencionEnum("tipo").notNull(),
    estado: estadoAtencionEnum("estado").notNull().default("Abierta"),
    competencia: competenciaEnum("competencia").notNull(),
    materia: varchar("materia", { length: 250 }).notNull(),
    descripcion: text("descripcion"),
    abogadoAsignadoId: uuid("abogado_asignado_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    fechaApertura: timestamp("fecha_apertura", { withTimezone: true }).notNull().defaultNow(),
    fechaCierre: timestamp("fecha_cierre", { withTimezone: true }),
    fechaUltimaGestion: timestamp("fecha_ultima_gestion", { withTimezone: true }),
    prioridad: prioridadEnum("prioridad").notNull().default("Media"),
    origen: varchar("origen", { length: 80 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planEstadoIdx: index("atenciones_plan_estado_idx").on(t.codPlan, t.estado),
    afiliadoIdx: index("atenciones_afiliado_idx").on(t.afiliadoId),
    abogadoIdx: index("atenciones_abogado_idx").on(t.abogadoAsignadoId),
    tipoFechaIdx: index("atenciones_tipo_fecha_idx").on(t.tipo, t.fechaApertura),
  }),
);

export type Atencion = typeof atenciones.$inferSelect;
export type NuevaAtencion = typeof atenciones.$inferInsert;

// Tabla de secuencias para generar correlativos atómicos por plan/año/tipo.
export const correlativos = pgTable(
  "correlativos",
  {
    codPlan: varchar("cod_plan", { length: 20 }).notNull(),
    tipo: tipoAtencionEnum("tipo").notNull(),
    anio: varchar("anio", { length: 4 }).notNull(),
    valor: jsonb("valor").$type<{ next: number }>().notNull().default({ next: 1 }),
  },
  (t) => ({
    pk: uniqueIndex("correlativos_pk").on(t.codPlan, t.tipo, t.anio),
  }),
);
