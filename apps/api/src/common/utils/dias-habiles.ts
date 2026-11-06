// Días hábiles = lunes a viernes. Los feriados chilenos no se consideran todavía.

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
// o el lunes siguiente si cae en fin de semana.
export function sumarDiasHabiles(iso: string, n: number): string {
  let actual = iso;
  while ([0, 6].includes(diaSemana(actual))) actual = sumarDias(actual, 1);
  let restantes = n;
  while (restantes > 0) {
    actual = sumarDias(actual, 1);
    if (![0, 6].includes(diaSemana(actual))) restantes--;
  }
  return actual;
}

// Días hábiles transcurridos entre dos fechas ISO (sin contar la inicial).
export function diasHabilesEntre(desde: string, hasta: string): number {
  let n = 0;
  let actual = desde;
  while (actual < hasta) {
    actual = sumarDias(actual, 1);
    if (![0, 6].includes(diaSemana(actual))) n++;
  }
  return n;
}

// Vencimiento al final de la jornada en Chile (23:59, hora estándar UTC-3/UTC-4 aproximada a -03).
export function finDeDiaChile(iso: string): Date {
  return new Date(`${iso}T23:59:00-03:00`);
}
