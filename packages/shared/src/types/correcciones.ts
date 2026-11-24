import { z } from "zod";

// Herramientas del administrador para corregir registros y retroceder flujos (Anexo §II l.156).
// Toda corrección exige un motivo, que queda en la bitácora del flujo y en la auditoría.
export const MotivoCorreccionSchema = z.object({
  motivo: z.string().trim().min(5, "Explique el motivo de la corrección").max(1000),
});
export type MotivoCorreccion = z.infer<typeof MotivoCorreccionSchema>;

// Estado de un arancel o una provisión al que se vuelve con "retroceder" (un paso atrás).
export const RETROCESO_ARANCEL: Record<string, string> = {
  EnAprobacion: "Requerido",
  Aprobado: "EnAprobacion",
  Pagado: "Aprobado",
};
export const RETROCESO_PROVISION: Record<string, string> = {
  Pagada: "Solicitada",
  EnAprobacion: "Pagada",
  Autorizada: "EnAprobacion",
  Disponible: "Autorizada",
  Entregada: "Disponible",
  Rendida: "Entregada",
};

// Panorama de una atención para la pantalla de correcciones.
export interface PanoramaCorreccion {
  atencion: { id: string; correlativo: string; tipo: string; estado: string; asunto: string };
  reabrible: boolean;
  arancel: { estado: string; retrocedeA: string | null } | null;
  provisiones: { id: string; monto: number; motivo: string; estado: string; retrocedeA: string | null }[];
  derivaciones: { id: string; nuevoTipo: string; estado: string; atencionDerivadaCorrelativo: string | null; reiniciable: boolean }[];
}
