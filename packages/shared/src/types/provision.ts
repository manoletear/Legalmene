import { z } from "zod";

// Decisión del cliente ante el monto a provisionar (Anexo §X 02–021). Si no acepta o paga
// directamente los gastos (no en juicios), el flujo de provisiones no opera; se puede reiniciar
// registrando que acepta.
export const DecisionProvisionEnum = z.enum(["Acepta", "NoAcepta", "PagaDirecto"]);
export type DecisionProvision = z.infer<typeof DecisionProvisionEnum>;
export const DECISION_PROVISION_LABEL: Record<DecisionProvision, string> = {
  Acepta: "Acepta provisionar",
  NoAcepta: "No acepta provisionar",
  PagaDirecto: "Paga directamente los gastos",
};
export const DecisionProvisionSchema = z.object({
  decision: DecisionProvisionEnum,
  observacion: z.string().trim().max(500).optional(),
});
export type DecisionProvisionInput = z.infer<typeof DecisionProvisionSchema>;
export interface DecisionProvisionRegistro {
  decision: DecisionProvision;
  observacion?: string | null;
  usuarioId: string;
  fecha: string;
}

// Ciclo de provisión de fondos (Anexo §X). Rechazada = solicitud inicial rechazada (legado);
// el rechazo de una entrega devuelve la provisión a Pagada.
export const EstadoProvisionEnum = z.enum([
  // Ingresada por el abogado y aún no notificada (Anexo §X 03): no la ve Finanzas.
  "Borrador",
  "Solicitada",
  "Pagada",
  "EnAprobacion",
  "Autorizada",
  "Rechazada",
  "Disponible",
  "Entregada",
  "Rendida",
  // Saldo no gastado devuelto por el abogado y registrado por el contador (Anexo §X 14).
  "Reingresado",
  // Fondos rendidos al cliente con el cheque de devolución (Anexo §X 20).
  "RendidaCliente",
  "Cerrada",
]);
export type EstadoProvision = z.infer<typeof EstadoProvisionEnum>;

export const ESTADO_PROVISION_LABEL: Record<EstadoProvision, string> = {
  Borrador: "Borrador (sin notificar)",
  Solicitada: "Solicitada",
  Pagada: "Pagada por cliente",
  EnAprobacion: "Entrega en aprobación",
  Autorizada: "Entrega autorizada",
  Rechazada: "Rechazada",
  Disponible: "Disponible para retiro",
  Entregada: "Entregada al abogado",
  Rendida: "Rendida",
  Reingresado: "Saldo reingresado",
  RendidaCliente: "Rendida al cliente",
  Cerrada: "Cerrada",
};

// Transiciones manuales permitidas (Cerrada la asigna el cierre de la atención).
export const TRANSICIONES_PROVISION: Record<EstadoProvision, readonly EstadoProvision[]> = {
  Borrador: ["Solicitada", "Cerrada"],
  Solicitada: ["Pagada"],
  Pagada: ["EnAprobacion", "RendidaCliente"],
  EnAprobacion: ["Autorizada", "Pagada"],
  Autorizada: ["Disponible"],
  Disponible: ["Entregada", "Pagada"],
  Entregada: ["Rendida"],
  Rendida: ["Reingresado", "RendidaCliente"],
  Reingresado: ["RendidaCliente"],
  RendidaCliente: [],
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
  cuotasPagoCliente: z.number().int().optional().nullable(),
  referenciaPagoCliente: z.string().optional().nullable(),
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
  // Gestión que origina el gasto (Anexo §VIII l.1062: "indicando la gestión a realizar").
  gestionId: z.string().uuid().optional(),
  // Ingresarla sin notificar; se notifica después junto con otras (Anexo §X 03).
  borrador: z.boolean().optional(),
});
export const NotificarProvisionesSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });
export type NotificarProvisiones = z.infer<typeof NotificarProvisionesSchema>;
export type SolicitarProvision = z.infer<typeof SolicitarProvisionSchema>;

// Datos del pago que registra el contador (Anexo §X 05): medio, cuotas y referencia del depósito o
// transferencia.
export const DatosPagoSchema = z.object({
  cuotas: z.number().int().min(1).max(48).optional(),
  referencia: z.string().trim().max(80).optional(),
});

export const PagoClienteSchema = DatosPagoSchema.extend({
  medio: MedioPagoEnum,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((p) => p.medio !== "Transferencia" || !!p.referencia, {
  message: "Una transferencia requiere su número de referencia",
  path: ["referencia"],
});
export type PagoCliente = z.infer<typeof PagoClienteSchema>;

export const ObservacionSchema = z.object({ observacion: z.string().max(2000).optional() });
export type Observacion = z.infer<typeof ObservacionSchema>;

export const RechazoSchema = z.object({ observacion: z.string().trim().min(3).max(2000) });
export type Rechazo = z.infer<typeof RechazoSchema>;

export const EntregaSchema = z.object({ montoEntregado: z.number().int().positive().optional() });
export type Entrega = z.infer<typeof EntregaSchema>;

// Cheque de devolución al cliente por el saldo de la cuenta de la atención (Anexo §X 18).
export const ChequeDevolucionSchema = z.object({
  numeroCheque: z.string().trim().min(1).max(40),
  observacion: z.string().max(2000).optional(),
});
export type ChequeDevolucion = z.infer<typeof ChequeDevolucionSchema>;

// Reingreso del saldo no gastado (lo registra el contador al recibirlo; Anexo §X 14).
export const ReingresoSchema = z.object({
  monto: z.number().int().positive(),
  glosa: z.string().trim().min(3).max(300).optional(),
});
export type Reingreso = z.infer<typeof ReingresoSchema>;

// Rendición de fondos al cliente (Anexo §X 16–20), una a la vez por atención.
export const EstadoRendicionClienteEnum = z.enum(["Solicitada", "ChequeEmitido", "Entregada"]);
export type EstadoRendicionCliente = z.infer<typeof EstadoRendicionClienteEnum>;
export const ESTADO_RENDICION_CLIENTE_LABEL: Record<EstadoRendicionCliente, string> = {
  Solicitada: "Rendición solicitada",
  ChequeEmitido: "Cheque de devolución disponible",
  Entregada: "Rendido a cliente",
};
export interface RendicionCliente {
  id: string;
  atencionId: string;
  estado: EstadoRendicionCliente;
  monto: number | null;
  numeroCheque: string | null;
  solicitadaPorId: string;
  solicitadaEn: string;
  chequePorId: string | null;
  chequeEn: string | null;
  entregadaPorId: string | null;
  entregadaEn: string | null;
}

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
  // Saldo de la cuenta de la atención: pagado por el cliente − gastos − devuelto al cliente.
  saldoCuenta: number;
  // Saldo de provisiones rendidas que el abogado aún no reingresa.
  pendienteReingreso: number;
  // Devuelto al cliente con cheque.
  rendidoCliente: number;
  // Rendición al cliente en curso o la última realizada.
  rendicion: RendicionCliente | null;
  // La materia exige provisión de fondos (maestro de materias, Anexo §VII l.806).
  materiaRequiereProvision?: boolean;
}

// Cuenta corriente por abogado (Anexo §X 12): saldos por entregar y montos por rendir.
export interface CuentaCorrienteAbogado {
  abogadoId: string;
  abogadoNombre: string;
  // Autorizado o disponible, aún no entregado.
  porEntregar: number;
  // Entregado y no rendido (saldo sin gastos).
  porRendir: number;
  // Rendido con saldo que aún no devuelve.
  porReingresar: number;
  provisiones: {
    id: string;
    atencionId: string;
    correlativo: string;
    motivo: string;
    estado: EstadoProvision;
    monto: number;
    montoEntregado: number | null;
    saldo: number;
    fechaEntrega: string | null;
  }[];
}
