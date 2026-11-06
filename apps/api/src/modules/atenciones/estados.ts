import {
  ESTADO_LABEL,
  faltantesCausante,
  type Causante,
  UMBRAL_RIESGO_COMITE,
  puedeTransicionar,
  riesgoTotal,
  type EstadoAtencion,
  type TipoAtencion,
} from "@legalmene/shared";

export interface AtencionParaTransicion {
  tipo: TipoAtencion;
  estado: EstadoAtencion;
  tribunalId: string | null;
  rolCausa: string | null;
  cuantiaMonto: number | null;
  cuantiaMoneda: string | null;
  riesgoMateria: number | null;
  riesgoCuantia: number | null;
  riesgoCliente: number | null;
  revisadoPorComite: boolean;
  causaTerminoId: string | null;
}

export interface ContextoTransicion {
  gestionesPendientes: number;
  comitesAbiertos: number;
  // Provisiones de fondos sin rendir ni cerrar (Anexo §VIII 10: cuentas cerradas al terminar).
  provisionesAbiertas?: number;
  // Motivo de retención por arancel impago; null si no aplica.
  bloqueoArancel?: string | null;
  // Posesión efectiva: antecedentes del causante y herederos vigentes.
  posesion?: { causante: Partial<Causante> | null; herederos: number };
}

// Estados en que se trabaja el caso: no se puede entrar a ellos con el arancel impago.
export const ESTADOS_DE_TRABAJO: readonly EstadoAtencion[] = [
  "Pendiente",
  "EnGestion",
  "EnEsperaAntecedentes",
  "EnEsperaProvision",
  "EnComite",
  "EnPreparacion",
  "DocumentosPendientes",
  "ListaEmision",
  "Terminada",
];

// Requisitos por etapa (Anexo §VII–VIII). Devuelve lo que falta, vacío si la transición procede.
export function validarTransicion(
  a: AtencionParaTransicion,
  destino: EstadoAtencion,
  ctx: ContextoTransicion,
): string[] {
  if (a.estado === destino) return [`La atención ya está en estado ${ESTADO_LABEL[destino]}`];
  if (destino === "Derivada") return ["El estado Derivada se asigna al aprobar una derivación"];
  if (!puedeTransicionar(a.tipo, a.estado, destino)) {
    return [`No se puede pasar de ${ESTADO_LABEL[a.estado]} a ${ESTADO_LABEL[destino]} en una ${a.tipo.toLowerCase()}`];
  }

  const faltan: string[] = [];
  if (a.tipo === "Consulta") return faltan;

  if (ctx.bloqueoArancel && ESTADOS_DE_TRABAJO.includes(destino)) faltan.push(ctx.bloqueoArancel);

  if (a.tipo === "PosesionEfectiva" && ["EnPreparacion", "DocumentosPendientes", "ListaEmision", "Terminada"].includes(destino)) {
    faltan.push(...faltantesCausante(ctx.posesion?.causante));
    if (["ListaEmision", "Terminada"].includes(destino) && (ctx.posesion?.herederos ?? 0) === 0) faltan.push("al menos un heredero");
  }
  if (a.tipo === "Juicio" && destino === "Pendiente") {
    if (!a.tribunalId) faltan.push("tribunal");
    if (!a.rolCausa) faltan.push("ROL/RIT de la causa");
    if (a.cuantiaMonto == null || !a.cuantiaMoneda) faltan.push("cuantía y moneda");
  }
  if (destino === "Terminada") {
    if (!a.causaTerminoId) faltan.push("causa de término");
    if (ctx.gestionesPendientes > 0) faltan.push(`${ctx.gestionesPendientes} gestión(es) pendiente(s)`);
    if (ctx.comitesAbiertos > 0) faltan.push("comité abierto");
    if ((ctx.provisionesAbiertas ?? 0) > 0) faltan.push(`${ctx.provisionesAbiertas} provisión(es) de fondos sin rendir`);
  }
  if (destino === "Abandonada") {
    if (!a.causaTerminoId) faltan.push("causa de término");
    if (riesgoTotal(a) >= UMBRAL_RIESGO_COMITE && !a.revisadoPorComite) {
      faltan.push(`revisión de comité (riesgo ${riesgoTotal(a)} ≥ ${UMBRAL_RIESGO_COMITE})`);
    }
  }
  return faltan;
}

export function mensajeFaltantes(destino: EstadoAtencion, faltan: string[]): string {
  if (faltan.length === 1 && /^(No se puede|La atención ya|El estado)/.test(faltan[0])) return faltan[0];
  return `No se puede pasar a ${ESTADO_LABEL[destino]}. Falta: ${faltan.join("; ")}`;
}
