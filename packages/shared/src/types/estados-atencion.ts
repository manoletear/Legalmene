import { z } from "zod";
import type { TipoAtencion } from "./atencion";

// Estados de atención del Anexo PSL (§VI–VIII). Un solo enum; cada tipo usa su subconjunto.
export const EstadoAtencionEnum = z.enum([
  "Iniciada",
  "Respondida",
  "Derivada",
  "Asignada",
  "Pendiente",
  "EnGestion",
  "EnEsperaAntecedentes",
  "EnEsperaArancel",
  "EnEsperaProvision",
  "EnComite",
  // Posesión efectiva.
  "Ingresada",
  "EnPreparacion",
  "DocumentosPendientes",
  "ListaEmision",
  "Terminada",
  "Abandonada",
]);
export type EstadoAtencion = z.infer<typeof EstadoAtencionEnum>;

export const ESTADO_LABEL: Record<EstadoAtencion, string> = {
  Iniciada: "Iniciada",
  Respondida: "Respondida",
  Derivada: "Derivada",
  Asignada: "Asignada",
  Pendiente: "Pendiente",
  EnGestion: "En gestión",
  EnEsperaAntecedentes: "Espera antecedentes",
  EnEsperaArancel: "Espera arancel",
  EnEsperaProvision: "Espera provisión",
  EnComite: "En comité",
  Ingresada: "Ingresada",
  EnPreparacion: "En preparación",
  DocumentosPendientes: "Documentos pendientes",
  ListaEmision: "Lista para emisión",
  Terminada: "Terminada",
  Abandonada: "Abandonada",
};

const ESPERAS = ["EnEsperaAntecedentes", "EnEsperaArancel", "EnEsperaProvision"] as const;

// Transiciones permitidas por tipo. "Derivada" solo se alcanza al aprobar una derivación.
type Mapa = Partial<Record<EstadoAtencion, readonly EstadoAtencion[]>>;

const CONSULTA: Mapa = {
  Iniciada: ["Respondida", "Terminada"],
  Respondida: ["Terminada"],
  Derivada: [],
  Terminada: [],
};

const ASESORIA_JUICIO: Mapa = {
  Asignada: ["Pendiente", ...ESPERAS, "Abandonada"],
  Pendiente: ["EnGestion", ...ESPERAS, "EnComite", "Terminada", "Abandonada"],
  EnGestion: ["Pendiente", ...ESPERAS, "EnComite", "Terminada", "Abandonada"],
  EnEsperaAntecedentes: ["Pendiente", "EnGestion", "EnEsperaArancel", "EnEsperaProvision", "Abandonada"],
  EnEsperaArancel: ["Pendiente", "EnGestion", "EnEsperaAntecedentes", "EnEsperaProvision", "Abandonada"],
  EnEsperaProvision: ["Pendiente", "EnGestion", "EnEsperaAntecedentes", "EnEsperaArancel", "Abandonada"],
  EnComite: ["Pendiente", "EnGestion", "Terminada", "Abandonada"],
  Terminada: [],
  Abandonada: [],
};

// Posesión efectiva: se ingresa, se preparan antecedentes del causante y herederos, se esperan
// documentos y queda lista para emitir la solicitud ante el Registro Civil.
const POSESION: Mapa = {
  Ingresada: ["EnPreparacion", "Abandonada"],
  EnPreparacion: ["DocumentosPendientes", "ListaEmision", "Abandonada"],
  DocumentosPendientes: ["EnPreparacion", "ListaEmision", "Abandonada"],
  ListaEmision: ["DocumentosPendientes", "Terminada", "Abandonada"],
  Terminada: [],
  Abandonada: [],
};

export const TRANSICIONES: Record<TipoAtencion, Mapa> = {
  Consulta: CONSULTA,
  Asesoria: ASESORIA_JUICIO,
  Juicio: ASESORIA_JUICIO,
  PosesionEfectiva: POSESION,
};

export const ESTADO_INICIAL: Record<TipoAtencion, EstadoAtencion> = {
  Consulta: "Iniciada",
  Asesoria: "Asignada",
  Juicio: "Asignada",
  PosesionEfectiva: "Ingresada",
};

// Etapas que muestra el pipeline de la ficha, en orden.
export const ETAPAS_PIPELINE: Record<TipoAtencion, readonly EstadoAtencion[]> = {
  Consulta: ["Iniciada", "Respondida", "Terminada"],
  Asesoria: ["Asignada", "Pendiente", "EnGestion", "EnComite", "Terminada"],
  Juicio: ["Asignada", "Pendiente", "EnGestion", "EnComite", "Terminada"],
  PosesionEfectiva: ["Ingresada", "EnPreparacion", "DocumentosPendientes", "ListaEmision", "Terminada"],
};

export const ESTADOS_TERMINALES: readonly EstadoAtencion[] = ["Derivada", "Terminada", "Abandonada"];

// Estados en que la atención está siendo trabajada (para KPIs y carga de abogados).
export const ESTADOS_ACTIVOS: readonly EstadoAtencion[] = [
  "Iniciada",
  "Asignada",
  "Pendiente",
  "EnGestion",
  "EnEsperaAntecedentes",
  "EnEsperaArancel",
  "EnEsperaProvision",
  "EnComite",
  "Ingresada",
  "EnPreparacion",
  "DocumentosPendientes",
  "ListaEmision",
];

export function estadosDeTipo(tipo: TipoAtencion): EstadoAtencion[] {
  return Object.keys(TRANSICIONES[tipo]) as EstadoAtencion[];
}

export function transicionesPermitidas(tipo: TipoAtencion, desde: EstadoAtencion): readonly EstadoAtencion[] {
  return TRANSICIONES[tipo][desde] ?? [];
}

export function puedeTransicionar(tipo: TipoAtencion, desde: EstadoAtencion, hasta: EstadoAtencion): boolean {
  return transicionesPermitidas(tipo, desde).includes(hasta);
}

export const CambiarEstadoSchema = z.object({
  estado: EstadoAtencionEnum,
  causaTerminoId: z.string().uuid().optional(),
  fechaTermino: z.string().datetime().optional(),
  observacion: z.string().max(2000).optional(),
});
export type CambiarEstado = z.infer<typeof CambiarEstadoSchema>;
