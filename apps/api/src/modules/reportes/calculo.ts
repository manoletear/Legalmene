import type { ConteoAtenciones, TipoAtencion } from "@legalmene/shared";

// Meses calendario (AAAA-MM) que toca el período, con su primer y último día.
export function mesesDelPeriodo(desde: string, hasta: string): { mes: string; inicio: string; fin: string }[] {
  const out: { mes: string; inicio: string; fin: string }[] = [];
  let [y, m] = desde.slice(0, 7).split("-").map(Number);
  const [yh, mh] = hasta.slice(0, 7).split("-").map(Number);
  while (y < yh || (y === yh && m <= mh)) {
    const mm = String(m).padStart(2, "0");
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({ mes: `${y}-${mm}`, inicio: `${y}-${mm}-01`, fin: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// Tasa de uso (fórmula a validar con LegalChile): atenciones del período / afiliados vigentes
// del período. null si el plan no tuvo afiliados vigentes.
export function tasaUso(atenciones: number, afiliadosVigentes: number): number | null {
  if (afiliadosVigentes <= 0) return null;
  return Math.round((atenciones / afiliadosVigentes) * 10_000) / 10_000;
}

export function conteoVacio(): ConteoAtenciones {
  return { consultas: 0, asesorias: 0, juicios: 0, posesiones: 0, total: 0 };
}

const CLAVE: Record<string, keyof Omit<ConteoAtenciones, "total">> = {
  Consulta: "consultas",
  Asesoria: "asesorias",
  Juicio: "juicios",
  PosesionEfectiva: "posesiones",
};

export function sumar(c: ConteoAtenciones, tipo: TipoAtencion | string, n: number): void {
  const k = CLAVE[tipo];
  if (!k) return;
  c[k] += n;
  c.total += n;
}
