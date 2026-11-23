import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  pgEnum,
  index,
  date,
} from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";
import { documentos } from "./documentos";

// Ciclo del Anexo §X (ver shared/provision.ts).
export const estadoProvisionEnum = pgEnum("estado_provision", [
  "Solicitada",
  "Pagada",
  "EnAprobacion",
  "Autorizada",
  "Rechazada",
  "Disponible",
  "Entregada",
  "Rendida",
  "Cerrada",
]);
export const medioPagoEnum = pgEnum("medio_pago", ["WebPay", "CasaCentral", "Transferencia"]);
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
    medioPagoCliente: medioPagoEnum("medio_pago_cliente"),
    fechaPagoCliente: date("fecha_pago_cliente", { mode: "string" }),
    fechaDisponible: timestamp("fecha_disponible", { withTimezone: true }),
    montoEntregado: integer("monto_entregado"),
    fechaEntrega: timestamp("fecha_entrega", { withTimezone: true }),
    fechaRendicion: timestamp("fecha_rendicion", { withTimezone: true }),
    numeroCheque: varchar("numero_cheque", { length: 40 }),
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
    // Comprobante del gasto real (Anexo §X 13).
    documentoId: uuid("documento_id").references(() => documentos.id, { onDelete: "set null" }),
  },
  (t) => ({
    provisionIdx: index("provision_movimientos_provision_idx").on(t.provisionId),
  }),
);

export type ProvisionMovimiento = typeof provisionMovimientos.$inferSelect;

// Bitácora de cambios de estado: usuario y fecha de cada etapa (Anexo §X 0.8).
export const provisionesEventos = pgTable(
  "provisiones_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provisionId: uuid("provision_id")
      .notNull()
      .references(() => provisiones.id, { onDelete: "restrict" }),
    estadoDesde: estadoProvisionEnum("estado_desde"),
    estadoHasta: estadoProvisionEnum("estado_hasta").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "restrict" }),
    observacion: text("observacion"),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ provisionIdx: index("provisiones_eventos_provision_idx").on(t.provisionId) }),
);
