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
import { competencias, materias } from "./maestros";
import { tipoAtencionEnum } from "./enums";

export { tipoAtencionEnum };
export const estadoAtencionEnum = pgEnum("estado_atencion", [
  "Abierta",
  "EnGestion",
  "EnComite",
  "Suspendida",
  "Cerrada",
  "Archivada",
]);
export const prioridadEnum = pgEnum("prioridad", ["Baja", "Media", "Alta", "Urgente"]);

export const atenciones = pgTable(
  "atenciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Correlativo legible al usuario, único global: ej. "CONS-2026-000123".
    correlativo: varchar("correlativo", { length: 32 }).notNull(),
    // Plan bajo el cual se prestó la atención (vigente del RUT, o REZAGADO/METLIFE).
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    afiliadoId: uuid("afiliado_id")
      .notNull()
      .references(() => afiliados.id, { onDelete: "restrict" }),
    tipo: tipoAtencionEnum("tipo").notNull(),
    estado: estadoAtencionEnum("estado").notNull().default("Abierta"),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    materiaId: uuid("materia_id")
      .notNull()
      .references(() => materias.id, { onDelete: "restrict" }),
    // Línea de asunto del caso (texto libre). La materia es el maestro.
    asunto: varchar("asunto", { length: 250 }).notNull(),
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
    correlativoUq: uniqueIndex("atenciones_correlativo_uq").on(t.correlativo),
    planEstadoIdx: index("atenciones_plan_estado_idx").on(t.codPlan, t.estado),
    afiliadoIdx: index("atenciones_afiliado_idx").on(t.afiliadoId),
    abogadoIdx: index("atenciones_abogado_idx").on(t.abogadoAsignadoId),
    tipoFechaIdx: index("atenciones_tipo_fecha_idx").on(t.tipo, t.fechaApertura),
    materiaIdx: index("atenciones_materia_idx").on(t.materiaId),
  }),
);

export type Atencion = typeof atenciones.$inferSelect;
export type NuevaAtencion = typeof atenciones.$inferInsert;

// Tabla de secuencias para generar correlativos atómicos por tipo/año.
export const correlativos = pgTable(
  "correlativos",
  {
    tipo: tipoAtencionEnum("tipo").notNull(),
    anio: varchar("anio", { length: 4 }).notNull(),
    valor: jsonb("valor").$type<{ next: number }>().notNull().default({ next: 1 }),
  },
  (t) => ({
    pk: uniqueIndex("correlativos_tipo_anio_uq").on(t.tipo, t.anio),
  }),
);
