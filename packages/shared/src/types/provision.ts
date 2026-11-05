import { z } from "zod";

// Ciclo de provisión de fondos (Anexo §X). Rechazada = solicitud inicial rechazada (legado);
// el rechazo de una entrega devuelve la provisión a Pagada.
export const EstadoProvisionEnum = z.enum([
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
export type EstadoProvision = z.infer<typeof EstadoProvisionEnum>;

export const ESTADO_PROVISION_LABEL: Record<EstadoProvision, string> = {
  Solicitada: "Solicitada",
  Pagada: "Pagada por cliente",
  EnAprobacion: "Entrega en aprobación",
  Autorizada: "Entrega autorizada",
  Rechazada: "Rechazada",
  Disponible: "Disponible para retiro",
  Entregada: "Entregada al abogado",
  Rendida: "Rendida",
  Cerrada: "Cerrada",
};

// Transiciones manuales permitidas (Cerrada la asigna el cierre de la atención).
export const TRANSICIONES_PROVISION: Record<EstadoProvision, readonly EstadoProvision[]> = {
  Solicitada: ["Pagada"],
  Pagada: ["EnAprobacion"],
  EnAprobacion: ["Autorizada", "Pagada"],
  Autorizada: ["Disponible"],
  Disponible: ["Entregada", "Pagada"],
  Entregada: ["Rendida"],
  Rendida: [],
  Rechazada: [],
  Cerrada: [],
};

export function puedeTransicionarProvision(desde: EstadoProvision, hasta: EstadoProvision): boolean {
  return TRANSICIONES_PROVISION[desde].includes(hasta);
}

// Estados con fondos aún sin cerrar: impiden terminar la atención.
export const ESTADOS_PROVISION_ABIERTOS: readonly EstadoProvision[] = [
  "Solicitada",
  "Pagada",
  "EnAprobacion",
  "Autorizada",
  "Disponible",
  "Entregada",
];

export const MedioPagoEnum = z.enum(["WebPay", "CasaCentral", "Transferencia"]);
export type MedioPago = z.infer<typeof MedioPagoEnum>;

export const TipoMovimientoProvisionEnum = z.enum(["Gasto", "Reintegro"]);
export type TipoMovimientoProvision = z.infer<typeof TipoMovimientoProvisionEnum>;

export const ProvisionSchema = z.object({
  id: z.string().uuid(),
  atencionId: z.string().uuid(),
  monto: z.number().int().positive(),
  motivo: z.string().min(3).max(500),
  estado: EstadoProvisionEnum,
  solicitadaPorId: z.string().uuid(),
  resueltaPorId: z.string().uuid().optional().nullable(),
  observacionResolucion: z.string().max(2000).optional().nullable(),
  fechaSolicitud: z.string().datetime(),
  fechaResolucion: z.string().datetime().optional().nullable(),
  medioPagoCliente: MedioPagoEnum.optional().nullable(),
  fechaPagoCliente: z.string().optional().nullable(),
  fechaDisponible: z.string().datetime().optional().nullable(),
  montoEntregado: z.number().int().optional().nullable(),
  fechaEntrega: z.string().datetime().optional().nullable(),
  fechaRendicion: z.string().datetime().optional().nullable(),
  numeroCheque: z.string().optional().nullable(),
});
export type Provision = z.infer<typeof ProvisionSchema>;

export const SolicitarProvisionSchema = z.object({
  monto: z.number().int().positive(),
  motivo: z.string().min(3).max(500),
});
export type SolicitarProvision = z.infer<typeof SolicitarProvisionSchema>;

export const PagoClienteSchema = z.object({
  medio: MedioPagoEnum,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PagoCliente = z.infer<typeof PagoClienteSchema>;

export const ObservacionSchema = z.object({ observacion: z.string().max(2000).optional() });
export type Observacion = z.infer<typeof ObservacionSchema>;

export const RechazoSchema = z.object({ observacion: z.string().trim().min(3).max(2000) });
export type Rechazo = z.infer<typeof RechazoSchema>;

export const EntregaSchema = z.object({ montoEntregado: z.number().int().positive().optional() });
export type Entrega = z.infer<typeof EntregaSchema>;

export const DevolucionSchema = z.object({
  numeroCheque: z.string().trim().min(1).max(40),
  observacion: z.string().max(2000).optional(),
});
export type Devolucion = z.infer<typeof DevolucionSchema>;

export const MovimientoProvisionSchema = z.object({
  id: z.string().uuid(),
  provisionId: z.string().uuid(),
  tipo: TipoMovimientoProvisionEnum,
  monto: z.number().int().positive(),
  glosa: z.string().min(3).max(300),
  registradoPorId: z.string().uuid(),
  fecha: z.string().datetime(),
  documentoId: z.string().uuid().optional().nullable(),
});
export type MovimientoProvision = z.infer<typeof MovimientoProvisionSchema>;

export const RegistrarMovimientoSchema = MovimientoProvisionSchema.pick({
  tipo: true,
  monto: true,
  glosa: true,
  documentoId: true,
});
export type RegistrarMovimiento = z.infer<typeof RegistrarMovimientoSchema>;

export interface EventoFinanciero {
  id: string;
  estadoDesde: string | null;
  estadoHasta: string;
  usuarioEmail: string | null;
  observacion: string | null;
  fecha: string;
}

// Saldos de un caso (Anexo §X). Montos en pesos.
export interface ResumenProvisionAtencion {
  // Pagado por el cliente (desde Pagada en adelante).
  provisionado: number;
  // Entregado al abogado.
  entregado: number;
  // Gastos reales registrados.
  utilizado: number;
  // Saldo devuelto por el abogado (reintegros).
  reintegrado: number;
  // Entregado − gastos − reintegros de provisiones aún no rendidas.
  saldoPorRendir: number;
  // Solicitado al cliente y aún no pagado.
  pendientePago: number;
}
