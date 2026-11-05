import { calcularDv } from "../../src/common/utils/rut";

// RUT válido y distinto en cada llamada: el RUT es único global y los specs corren
// en paralelo sobre la misma base. Rango 40–49 millones para no chocar con el seed.
export function rutAleatorio(): string {
  const cuerpo = String(40_000_000 + Math.floor(Math.random() * 10_000_000));
  return `${cuerpo}-${calcularDv(cuerpo)}`;
}

export function planAleatorio(prefijo = "TEST"): string {
  return `${prefijo}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Fecha AAAA-MM-DD desplazada en días desde hoy (UTC; los tests usan márgenes de varios días).
export function fechaRelativa(dias: number): string {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
}
