import { describe, expect, it } from "vitest";
import { dentroDeHorario } from "@legalmene/shared";

describe("horario de acceso del perfil", () => {
  const h = { dias: [1, 2, 3, 4, 5], desde: "08:00", hasta: "20:00" };
  it("sin horario siempre permite; con horario usa la hora de Chile", () => {
    expect(dentroDeHorario(null)).toBe(true);
    // Miércoles 25-11-2026 10:00 en Chile (UTC−3) = 13:00 UTC.
    expect(dentroDeHorario(h, new Date("2026-11-25T13:00:00Z"))).toBe(true);
    // Mismo día 21:00 en Chile.
    expect(dentroDeHorario(h, new Date("2026-11-26T00:00:00Z"))).toBe(false);
    // Sábado 28-11-2026 10:00 en Chile.
    expect(dentroDeHorario(h, new Date("2026-11-28T13:00:00Z"))).toBe(false);
  });
});
