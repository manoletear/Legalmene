import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  pgEnum,
  date,
  uniqueIndex,
  index,
  text,
} from "drizzle-orm/pg-core";
import { planes } from "./planes";

export const vigenciaAfiliadoEnum = pgEnum("vigencia_afiliado", [
  "Activo",
  "Inactivo",
  "Eliminado",
]);

// Persona afiliada, única por RUT. Sus planes y vigencias viven en planes_afiliado.
export const afiliados = pgTable(
  "afiliados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rut: varchar("rut", { length: 12 }).notNull(),
    nombres: varchar("nombres", { length: 120 }).notNull(),
    apellidoPaterno: varchar("apellido_paterno", { length: 80 }).notNull(),
    apellidoMaterno: varchar("apellido_materno", { length: 80 }),
    email: varchar("email", { length: 200 }),
    telefono: varchar("telefono", { length: 20 }),
    direccion: varchar("direccion", { length: 250 }),
    comuna: varchar("comuna", { length: 80 }),
    region: varchar("region", { length: 80 }),
    fechaNacimiento: date("fecha_nacimiento"),
    vigencia: vigenciaAfiliadoEnum("vigencia").notNull().default("Activo"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rutUnique: uniqueIndex("afiliados_rut_uq").on(t.rut),
    nombreSearchIdx: index("afiliados_nombre_search_idx").on(t.apellidoPaterno, t.nombres),
  }),
);

export type Afiliado = typeof afiliados.$inferSelect;
export type NuevoAfiliado = typeof afiliados.$inferInsert;

// Relación RUT–Plan con su vigencia (tabla PlanesAfiliado del Anexo).
export const planesAfiliado = pgTable(
  "planes_afiliado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    afiliadoId: uuid("afiliado_id")
      .notNull()
      .references(() => afiliados.id, { onDelete: "restrict" }),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    fechaInicio: date("fecha_inicio", { mode: "string" }).notNull(),
    fechaTermino: date("fecha_termino", { mode: "string" }),
    vigencia: vigenciaAfiliadoEnum("vigencia").notNull().default("Activo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    afiliadoPlanUq: uniqueIndex("planes_afiliado_afiliado_plan_uq").on(t.afiliadoId, t.codPlan),
    planVigenciaIdx: index("planes_afiliado_plan_vigencia_idx").on(t.codPlan, t.vigencia),
  }),
);

export type PlanAfiliado = typeof planesAfiliado.$inferSelect;
export type NuevoPlanAfiliado = typeof planesAfiliado.$inferInsert;

export const parentescoEnum = pgEnum("parentesco", ["Conyuge", "ConvivienteCivil", "Hijo", "Padre", "Madre", "Otro"]);

// Carga (familiar) cubierta por la relación RUT–Plan del titular (Anexo §III).
export const cargasAfiliado = pgTable(
  "cargas_afiliado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    afiliadoId: uuid("afiliado_id")
      .notNull()
      .references(() => afiliados.id, { onDelete: "restrict" }),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    rut: varchar("rut", { length: 12 }).notNull(),
    nombres: varchar("nombres", { length: 120 }).notNull(),
    apellidoPaterno: varchar("apellido_paterno", { length: 80 }).notNull(),
    apellidoMaterno: varchar("apellido_materno", { length: 80 }),
    parentesco: parentescoEnum("parentesco"),
    fechaNacimiento: date("fecha_nacimiento", { mode: "string" }),
    fechaInicio: date("fecha_inicio", { mode: "string" }).notNull(),
    fechaTermino: date("fecha_termino", { mode: "string" }),
    vigencia: vigenciaAfiliadoEnum("vigencia").notNull().default("Activo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    titularPlanRutUq: uniqueIndex("cargas_afiliado_titular_plan_rut_uq").on(t.afiliadoId, t.codPlan, t.rut),
    rutIdx: index("cargas_afiliado_rut_idx").on(t.rut),
    planIdx: index("cargas_afiliado_plan_idx").on(t.codPlan, t.vigencia),
  }),
);
export type CargaAfiliadoRow = typeof cargasAfiliado.$inferSelect;

export const tipoBienEnum = pgEnum("tipo_bien", ["Inmueble", "Vehiculo", "Otro"]);

// Bien cubierto por la relación RUT–Plan (p. ej. inmueble o vehículo), Anexo §III.
export const bienesAfiliado = pgTable(
  "bienes_afiliado",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    afiliadoId: uuid("afiliado_id")
      .notNull()
      .references(() => afiliados.id, { onDelete: "restrict" }),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    tipo: tipoBienEnum("tipo").notNull(),
    // Rol SII, patente u otro identificador; se guarda en mayúsculas y sin espacios extremos.
    identificador: varchar("identificador", { length: 60 }).notNull(),
    descripcion: text("descripcion"),
    comuna: varchar("comuna", { length: 80 }),
    fechaInicio: date("fecha_inicio", { mode: "string" }).notNull(),
    fechaTermino: date("fecha_termino", { mode: "string" }),
    vigencia: vigenciaAfiliadoEnum("vigencia").notNull().default("Activo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    titularPlanBienUq: uniqueIndex("bienes_afiliado_titular_plan_bien_uq").on(t.afiliadoId, t.codPlan, t.tipo, t.identificador),
    identificadorIdx: index("bienes_afiliado_identificador_idx").on(t.identificador),
    planIdx: index("bienes_afiliado_plan_idx").on(t.codPlan, t.vigencia),
  }),
);
export type BienAfiliadoRow = typeof bienesAfiliado.$inferSelect;
