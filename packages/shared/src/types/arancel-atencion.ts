import { z } from "zod";
import { DatosPagoSchema, MedioPagoEnum } from "./provision";
import type { ModalidadCobertura } from "./cobertura";

// Arancel (copago) de una atención (Anexo §IX): rojo → naranjo → amarillo → verde.
export const EstadoArancelAtencionEnum = z.enum([
  "NoRequerido",
  "Requerido",
  "EnAprobacion",
  "Aprobado",
  "Pagado",
  "Rechazado",
]);
export type EstadoArancelAtencion = z.infer<typeof EstadoArancelAtencionEnum>;

export const ESTADO_ARANCEL_LABEL: Record<EstadoArancelAtencion, string> = {
  NoRequerido: "Sin copago",
  Requerido: "Copago requerido",
  EnAprobacion: "En aprobación",
  Aprobado: "Aprobado, pendiente de pago",
  Pagado: "Pagado",
  Rechazado: "Rechazado",
};

// Color del botón "Arancel" del sistema legado.
export const ESTADO_ARANCEL_COLOR: Record<EstadoArancelAtencion, string> = {
  NoRequerido: "#94a3b8",
  Requerido: "#dc2626",
  EnAprobacion: "#ea580c",
  Aprobado: "#ca8a04",
  Pagado: "#16a34a",
  Rechazado: "#dc2626",
};

// Con el arancel en estos estados la atención queda detenida.
export const ESTADOS_ARANCEL_BLOQUEANTES: readonly EstadoArancelAtencion[] = ["Requerido", "EnAprobacion", "Aprobado"];

export const TRANSICIONES_ARANCEL: Record<EstadoArancelAtencion, readonly EstadoArancelAtencion[]> = {
  NoRequerido: [],
  Requerido: ["EnAprobacion"],
  EnAprobacion: ["Aprobado", "Requerido"],
  Aprobado: ["Pagado"],
  Pagado: [],
  Rechazado: [],
};

// Camino elegido con el cliente (Anexo §IX 3): "Enviar Arancel" a la jefatura o "Notificar Pago" por
// WebPay. Se puede cambiar en cualquier momento salvo con el arancel Pagado.
export const CaminoPagoArancelEnum = z.enum(["Aprobacion", "WebPay"]);
export type CaminoPagoArancel = z.infer<typeof CaminoPagoArancelEnum>;
export const CAMINO_PAGO_LABEL: Record<CaminoPagoArancel, string> = {
  Aprobacion: "Aprobación de jefatura y pago en casa central",
  WebPay: "Pago en línea (WebPay)",
};
// Estados desde los que el pago WebPay del cliente deja el arancel Pagado.
export const ESTADOS_ARANCEL_PAGABLES_WEBPAY: readonly EstadoArancelAtencion[] = ["Requerido", "EnAprobacion", "Aprobado"];

export interface ArancelAtencion {
  id: string;
  atencionId: string;
  arancelId: string | null;
  coberturaModalidad: ModalidadCobertura | null;
  coberturaPorcentaje: number | null;
  copagoUfCentesimas: number | null;
  estado: EstadoArancelAtencion;
  motivoRechazo: string | null;
  fechaPago: string | null;
  medioPago: z.infer<typeof MedioPagoEnum> | null;
  cuotasPago: number | null;
  referenciaPago: string | null;
  ufValorCentavos: number | null;
  montoClp: number | null;
  comprobanteDocumentoId: string | null;
  caminoPago: CaminoPagoArancel | null;
  webpayOrdenCompra: string | null;
}

export interface ArancelAtencionRow extends ArancelAtencion {
  correlativo: string;
  asunto: string;
  tipo: string;
  codPlan: string;
}

export const PagoArancelSchema = DatosPagoSchema.extend({
  medio: MedioPagoEnum,
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comprobanteDocumentoId: z.string().uuid().optional(),
}).refine((p) => p.medio !== "Transferencia" || !!p.referencia, {
  message: "Una transferencia requiere su número de referencia",
  path: ["referencia"],
});
export type PagoArancel = z.infer<typeof PagoArancelSchema>;
