import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { afiliados } from "./afiliados";
import { atenciones } from "./atenciones";
import { planes } from "./planes";

export const estadoPagoEnum = pgEnum("estado_pago", [
  "Iniciado",
  "Autorizado",
  "Rechazado",
  "Anulado",
  "Reembolsado",
]);
export const proveedorPagoEnum = pgEnum("proveedor_pago", ["WebPay", "Khipu", "Manual"]);

// Montos en centavos (CLP no tiene decimales pero se mantiene la convención).
export const pagos = pgTable(
  "pagos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id").references(() => atenciones.id, { onDelete: "set null" }),
    afiliadoId: uuid("afiliado_id")
      .notNull()
      .references(() => afiliados.id, { onDelete: "restrict" }),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    monto: integer("monto").notNull(),
    moneda: varchar("moneda", { length: 3 }).notNull().default("CLP"),
    estado: estadoPagoEnum("estado").notNull().default("Iniciado"),
    proveedor: proveedorPagoEnum("proveedor").notNull().default("WebPay"),
    tokenTransaccion: varchar("token_transaccion", { length: 128 }),
    ordenCompra: varchar("orden_compra", { length: 64 }).notNull().unique(),
    authCode: varchar("auth_code", { length: 32 }),
    numeroTarjeta: varchar("numero_tarjeta", { length: 4 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    fechaIniciado: timestamp("fecha_iniciado", { withTimezone: true }).notNull().defaultNow(),
    fechaResolucion: timestamp("fecha_resolucion", { withTimezone: true }),
  },
  (t) => ({
    afiliadoIdx: index("pagos_afiliado_idx").on(t.afiliadoId),
    estadoIdx: index("pagos_estado_idx").on(t.estado),
    atencionIdx: index("pagos_atencion_idx").on(t.atencionId),
  }),
);

export type Pago = typeof pagos.$inferSelect;
export type NuevoPago = typeof pagos.$inferInsert;
