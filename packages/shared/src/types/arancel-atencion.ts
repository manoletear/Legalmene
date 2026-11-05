import { z } from "zod";
import { MedioPagoEnum } from "./provision";
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
  ufValorCentavos: number | null;
  montoClp: number | null;
  comprobanteDocumentoId: string | null;
}

export interface ArancelAtencionRow extends ArancelAtencion {
  correlativo: string;
  asunto: string;
  tipo: string;
  codPlan: string;
}

export const PagoArancelSchema = z.object({
  medio: MedioPagoEnum,
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comprobanteDocumentoId: z.string().uuid().optional(),
});
export type PagoArancel = z.infer<typeof PagoArancelSchema>;
