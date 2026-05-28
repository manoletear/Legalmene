import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { planes } from "./planes";

export const vigenciaAfiliadoEnum = pgEnum("vigencia_afiliado", [
  "Activo",
  "Inactivo",
  "Eliminado",
]);

export const afiliados = pgTable(
  "afiliados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
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
    fechaIngreso: timestamp("fecha_ingreso", { withTimezone: true }).notNull().defaultNow(),
    fechaEgreso: timestamp("fecha_egreso", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rutPlanUnique: uniqueIndex("afiliados_rut_plan_uq").on(t.rut, t.codPlan),
    planVigenciaIdx: index("afiliados_plan_vigencia_idx").on(t.codPlan, t.vigencia),
    nombreSearchIdx: index("afiliados_nombre_search_idx").on(t.apellidoPaterno, t.nombres),
  }),
);

export type Afiliado = typeof afiliados.$inferSelect;
export type NuevoAfiliado = typeof afiliados.$inferInsert;
