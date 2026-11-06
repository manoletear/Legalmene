// Validador y normalizador de RUT chileno.

export function limpiarRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatearRut(rut: string): string {
  const clean = limpiarRut(rut);
  if (clean.length < 2) return clean;
  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${parseInt(cuerpo, 10)}-${dv}`;
}

export function calcularDv(cuerpo: string): string {
  let suma = 0;
  let mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

export function rutValido(rut: string): boolean {
  const clean = limpiarRut(rut);
  if (clean.length < 2 || clean.length > 9) return false;
  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  return calcularDv(cuerpo) === dv;
}
