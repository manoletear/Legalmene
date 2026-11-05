import { ESTADO_LABEL, EstadoAtencionEnum, type EstadoAtencion } from "@legalmene/shared";

export type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

export function estadoLabel(e: string): string {
  return ESTADO_LABEL[e as EstadoAtencion] ?? e;
}

export function estadoSeverity(e: string): Severity {
  if (e === "Terminada") return "success";
  if (e === "Abandonada" || e === "Derivada") return "secondary";
  if (e.startsWith("EnEspera") || e === "EnComite") return "warn";
  return "info";
}

export const ESTADO_OPCIONES = EstadoAtencionEnum.options.map((value) => ({ label: ESTADO_LABEL[value], value }));
