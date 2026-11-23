// Días hábiles = lunes a viernes que no son feriado. Los feriados vienen de la tabla `feriados`
// (FeriadosService los carga al iniciar y al editarlos); sin cargar, solo se saltan fines de semana.

let feriados: ReadonlySet<string> = new Set();

export function establecerFeriados(fechas: Iterable<string>): void {
  feriados = new Set(fechas);
}

export function esDiaHabil(iso: string): boolean {
  return ![0, 6].includes(diaSemana(iso)) && !feriados.has(iso);
}

// Fecha calendario actual en Chile (YYYY-MM-DD).
export function hoyChileISO(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}

function diaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Suma n días hábiles a una fecha ISO. Con n = 0 devuelve la misma fecha si es hábil,
// o el siguiente día hábil si no lo es.
export function sumarDiasHabiles(iso: string, n: number): string {
  let actual = iso;
  while (!esDiaHabil(actual)) actual = sumarDias(actual, 1);
  let restantes = n;
  while (restantes > 0) {
    actual = sumarDias(actual, 1);
    if (esDiaHabil(actual)) restantes--;
  }
  return actual;
}

// Días hábiles transcurridos entre dos fechas ISO (sin contar la inicial).
export function diasHabilesEntre(desde: string, hasta: string): number {
  let n = 0;
  let actual = desde;
  while (actual < hasta) {
    actual = sumarDias(actual, 1);
    if (esDiaHabil(actual)) n++;
  }
  return n;
}

// Instante de una hora local de Chile continental (America/Santiago, con su horario de verano o
// invierno) en una fecha ISO. Ej.: instanteChile("2026-07-01", "15:00") → 19:00 UTC.
export function instanteChile(iso: string, hhmm: string): Date {
  const supuesto = new Date(`${iso}T${hhmm}:00Z`);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(supuesto);
  const n = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  return new Date(supuesto.getTime() - (local - supuesto.getTime()));
}

// Vencimiento al final de la jornada en Chile (23:59 hora local).
export function finDeDiaChile(iso: string): Date {
  return instanteChile(iso, "23:59");
}
