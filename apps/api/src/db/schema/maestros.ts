import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

// Maestros administrables (Anexo §II.E). vigente=false oculta el registro de los
// formularios sin borrarlo, para no romper atenciones históricas.

// Función: cada tabla necesita sus propias instancias de columna.
const comunes = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  vigente: boolean("vigente").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competencias = pgTable(
  "competencias",
  { ...comunes(), nombre: varchar("nombre", { length: 120 }).notNull() },
  (t) => ({ nombreUq: uniqueIndex("competencias_nombre_uq").on(t.nombre) }),
);
export type CompetenciaRow = typeof competencias.$inferSelect;

export const materias = pgTable(
  "materias",
  {
    ...comunes(),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    nombre: varchar("nombre", { length: 200 }).notNull(),
    aplicaConsulta: boolean("aplica_consulta").notNull().default(true),
    aplicaAsesoria: boolean("aplica_asesoria").notNull().default(true),
    aplicaJuicio: boolean("aplica_juicio").notNull().default(true),
    requiereProvision: boolean("requiere_provision").notNull().default(false),
  },
  (t) => ({
    competenciaNombreUq: uniqueIndex("materias_competencia_nombre_uq").on(t.competenciaId, t.nombre),
  }),
);
export type MateriaRow = typeof materias.$inferSelect;

export const procedimientos = pgTable(
  "procedimientos",
  {
    ...comunes(),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    nombre: varchar("nombre", { length: 200 }).notNull(),
  },
  (t) => ({
    competenciaNombreUq: uniqueIndex("procedimientos_competencia_nombre_uq").on(t.competenciaId, t.nombre),
  }),
);

export const tribunales = pgTable(
  "tribunales",
  {
    ...comunes(),
    nombre: varchar("nombre", { length: 200 }).notNull(),
    region: varchar("region", { length: 80 }),
    comuna: varchar("comuna", { length: 80 }),
  },
  (t) => ({
    nombreUq: uniqueIndex("tribunales_nombre_uq").on(t.nombre),
    regionIdx: index("tribunales_region_idx").on(t.region),
  }),
);

function maestroSimple(nombreTabla: string) {
  return pgTable(
    nombreTabla,
    { ...comunes(), nombre: varchar("nombre", { length: 200 }).notNull() },
    (t) => ({ nombreUq: uniqueIndex(`${nombreTabla}_nombre_uq`).on(t.nombre) }),
  );
}

export const organismos = maestroSimple("organismos");
export const tiposConsulta = maestroSimple("tipos_consulta");
export const causasTermino = maestroSimple("causas_termino");
export const calidadesProcesales = maestroSimple("calidades_procesales");
