import { pgTable, uuid, varchar, text, timestamp, date, pgEnum, index, boolean } from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";

// Antecedentes del causante de una atención de tipo PosesionEfectiva (1:1 con la atención).
export const posesionesEfectivas = pgTable("posesiones_efectivas", {
  atencionId: uuid("atencion_id")
    .primaryKey()
    .references(() => atenciones.id, { onDelete: "restrict" }),
  causanteRut: varchar("causante_rut", { length: 12 }),
  causanteNombre: varchar("causante_nombre", { length: 200 }),
  causanteFechaDefuncion: date("causante_fecha_defuncion", { mode: "string" }),
  causanteUltimoDomicilio: varchar("causante_ultimo_domicilio", { length: 250 }),
  causanteComuna: varchar("causante_comuna", { length: 80 }),
  observaciones: text("observaciones"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PosesionEfectivaRow = typeof posesionesEfectivas.$inferSelect;

export const calidadHerederoEnum = pgEnum("calidad_heredero", ["Conyuge", "ConvivienteCivil", "Hijo", "Padre", "Madre", "Hermano", "Otro"]);

// Herederos de la posesión efectiva. Se desactivan (vigente = false), no se borran.
export const herederosPosesion = pgTable(
  "herederos_posesion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => posesionesEfectivas.atencionId, { onDelete: "restrict" }),
    rut: varchar("rut", { length: 12 }).notNull(),
    nombre: varchar("nombre", { length: 200 }).notNull(),
    calidad: calidadHerederoEnum("calidad").notNull(),
    domicilio: varchar("domicilio", { length: 250 }),
    email: varchar("email", { length: 200 }),
    telefono: varchar("telefono", { length: 30 }),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ atencionIdx: index("herederos_posesion_atencion_idx").on(t.atencionId) }),
);
export type HerederoRow = typeof herederosPosesion.$inferSelect;
