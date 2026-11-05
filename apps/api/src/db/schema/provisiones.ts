import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";

export const estadoProvisionEnum = pgEnum("estado_provision", [
  "Solicitada",
  "Aprobada",
  "Rechazada",
]);
export const tipoMovimientoProvisionEnum = pgEnum("tipo_movimiento_provision", [
  "Gasto",
  "Reintegro",
]);

// Fondos asignados a un caso. Montos en pesos (enteros).
export const provisiones = pgTable(
  "provisiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "restrict" }),
    monto: integer("monto").notNull(),
    motivo: varchar("motivo", { length: 500 }).notNull(),
    estado: estadoProvisionEnum("estado").notNull().default("Solicitada"),
    solicitadaPorId: uuid("solicitada_por_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    resueltaPorId: uuid("resuelta_por_id").references(() => usuarios.id, {
      onDelete: "restrict",
    }),
    observacionResolucion: text("observacion_resolucion"),
    fechaSolicitud: timestamp("fecha_solicitud", { withTimezone: true }).notNull().defaultNow(),
    fechaResolucion: timestamp("fecha_resolucion", { withTimezone: true }),
  },
  (t) => ({
    estadoIdx: index("provisiones_estado_idx").on(t.estado),
    atencionIdx: index("provisiones_atencion_idx").on(t.atencionId),
  }),
);

export type Provision = typeof provisiones.$inferSelect;
export type NuevaProvision = typeof provisiones.$inferInsert;

export const provisionMovimientos = pgTable(
  "provision_movimientos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provisionId: uuid("provision_id")
      .notNull()
      .references(() => provisiones.id, { onDelete: "restrict" }),
    tipo: tipoMovimientoProvisionEnum("tipo").notNull(),
    monto: integer("monto").notNull(),
    glosa: varchar("glosa", { length: 300 }).notNull(),
    registradoPorId: uuid("registrado_por_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    provisionIdx: index("provision_movimientos_provision_idx").on(t.provisionId),
  }),
);

export type ProvisionMovimiento = typeof provisionMovimientos.$inferSelect;
