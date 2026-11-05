import { pgTable, uuid, integer, text, timestamp, pgEnum, index, uniqueIndex, date } from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { aranceles, modalidadCoberturaEnum } from "./aranceles";
import { usuarios } from "./usuarios";
import { documentos } from "./documentos";
import { medioPagoEnum } from "./provisiones";

export const estadoArancelAtencionEnum = pgEnum("estado_arancel_atencion", [
  "NoRequerido",
  "Requerido",
  "EnAprobacion",
  "Aprobado",
  "Pagado",
  "Rechazado",
]);

// Copago de una atención (Anexo §IX). Guarda la foto del arancel y la cobertura al calcularlo.
export const arancelesAtencion = pgTable(
  "aranceles_atencion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "restrict" }),
    arancelId: uuid("arancel_id").references(() => aranceles.id, { onDelete: "set null" }),
    coberturaModalidad: modalidadCoberturaEnum("cobertura_modalidad"),
    coberturaPorcentaje: integer("cobertura_porcentaje"),
    copagoUfCentesimas: integer("copago_uf_centesimas"),
    estado: estadoArancelAtencionEnum("estado").notNull(),
    motivoRechazo: text("motivo_rechazo"),
    fechaPago: date("fecha_pago", { mode: "string" }),
    medioPago: medioPagoEnum("medio_pago"),
    // UF del día del pago (centavos) y monto pagado en pesos.
    ufValorCentavos: integer("uf_valor_centavos"),
    montoClp: integer("monto_clp"),
    comprobanteDocumentoId: uuid("comprobante_documento_id").references(() => documentos.id, { onDelete: "set null" }),
    registradoPorId: uuid("registrado_por_id").references(() => usuarios.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionUq: uniqueIndex("aranceles_atencion_atencion_uq").on(t.atencionId),
    estadoIdx: index("aranceles_atencion_estado_idx").on(t.estado),
  }),
);
export type ArancelAtencionRow = typeof arancelesAtencion.$inferSelect;

export const arancelesAtencionEventos = pgTable(
  "aranceles_atencion_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    arancelAtencionId: uuid("arancel_atencion_id")
      .notNull()
      .references(() => arancelesAtencion.id, { onDelete: "restrict" }),
    estadoDesde: estadoArancelAtencionEnum("estado_desde"),
    estadoHasta: estadoArancelAtencionEnum("estado_hasta").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "restrict" }),
    observacion: text("observacion"),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ arancelIdx: index("aranceles_atencion_eventos_arancel_idx").on(t.arancelAtencionId) }),
);
