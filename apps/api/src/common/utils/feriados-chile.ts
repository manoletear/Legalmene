// Feriados legales nacionales de Chile calculados por año. Alimentan la tabla `feriados`
// (FeriadosService), donde el administrador agrega los que fija un decreto o una ley especial
// (elecciones, feriados únicos) y desactiva los que no correspondan. Los feriados regionales
// (7 de junio en Arica, 20 de agosto en Chillán) no se incluyen.

export interface FeriadoLegal {
  fecha: string; // AAAA-MM-DD
  nombre: string;
}

const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

function diaSemana(anio: number, mes: number, dia: number): number {
  return new Date(Date.UTC(anio, mes - 1, dia, 12)).getUTCDay();
}

function sumar(anio: number, mes: number, dia: number, n: number): string {
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Domingo de Pascua (algoritmo gregoriano anónimo de Meeus/Jones/Butcher).
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
}

// Ley 19.668: si cae martes o miércoles se traslada al lunes anterior; si cae jueves o
// viernes, al lunes siguiente. Sábado, domingo y lunes se mantienen.
function trasladoALunes(anio: number, mes: number, dia: number): string {
  const dow = diaSemana(anio, mes, dia);
  if (dow === 2 || dow === 3) return sumar(anio, mes, dia, -(dow - 1));
  if (dow === 4 || dow === 5) return sumar(anio, mes, dia, 8 - dow);
  return iso(anio, mes, dia);
}

// Día del solsticio de invierno austral en hora de Chile (Ley 21.357, Día de los Pueblos
// Indígenas). Aproximación de Meeus para el solsticio de junio (error de minutos en este siglo),
// convertida a la hora de Chile continental en invierno (UTC−4).
export function solsticioDeInvierno(anio: number): string {
  const y = (anio - 2000) / 1000;
  const jde = 2451716.56767 + 365241.62603 * y + 0.00325 * y ** 2 + 0.00888 * y ** 3 - 0.0003 * y ** 4;
  const ms = (jde - 2440587.5) * 86_400_000 - 4 * 3_600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function feriadosLegales(anio: number): FeriadoLegal[] {
  const pascua = domingoDePascua(anio);
  const [, pm, pd] = pascua.split("-").map(Number);
  const lista: FeriadoLegal[] = [
    { fecha: iso(anio, 1, 1), nombre: "Año Nuevo" },
    { fecha: sumar(anio, pm, pd, -2), nombre: "Viernes Santo" },
    { fecha: sumar(anio, pm, pd, -1), nombre: "Sábado Santo" },
    { fecha: iso(anio, 5, 1), nombre: "Día Nacional del Trabajo" },
    { fecha: iso(anio, 5, 21), nombre: "Día de las Glorias Navales" },
    { fecha: solsticioDeInvierno(anio), nombre: "Día Nacional de los Pueblos Indígenas" },
    { fecha: trasladoALunes(anio, 6, 29), nombre: "San Pedro y San Pablo" },
    { fecha: iso(anio, 7, 16), nombre: "Día de la Virgen del Carmen" },
    { fecha: iso(anio, 8, 15), nombre: "Asunción de la Virgen" },
    { fecha: iso(anio, 9, 18), nombre: "Independencia Nacional" },
    { fecha: iso(anio, 9, 19), nombre: "Día de las Glorias del Ejército" },
    { fecha: trasladoALunes(anio, 10, 12), nombre: "Encuentro de Dos Mundos" },
    { fecha: iso(anio, 11, 1), nombre: "Día de Todos los Santos" },
    { fecha: iso(anio, 12, 8), nombre: "Inmaculada Concepción" },
    { fecha: iso(anio, 12, 25), nombre: "Navidad" },
  ];
  // Fiestas Patrias: el 17 es feriado si el 18 cae martes; el 20, si el 19 cae jueves.
  if (diaSemana(anio, 9, 18) === 2) lista.push({ fecha: iso(anio, 9, 17), nombre: "Fiestas Patrias (feriado adicional)" });
  if (diaSemana(anio, 9, 19) === 4) lista.push({ fecha: iso(anio, 9, 20), nombre: "Fiestas Patrias (feriado adicional)" });
  // Ley 20.299: Día de las Iglesias Evangélicas; martes → viernes 27, miércoles → viernes 2 de noviembre.
  const dow31 = diaSemana(anio, 10, 31);
  lista.push({
    fecha: dow31 === 2 ? iso(anio, 10, 27) : dow31 === 3 ? iso(anio, 11, 2) : iso(anio, 10, 31),
    nombre: "Día de las Iglesias Evangélicas y Protestantes",
  });
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
