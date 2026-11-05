import { describe, expect, it } from "vitest";
import { diasHabilesEntre, hoyChileISO, sumarDiasHabiles } from "./dias-habiles";

describe("días hábiles", () => {
  it("salta sábados y domingos", () => {
    // 2026-11-06 es viernes.
    expect(sumarDiasHabiles("2026-11-06", 1)).toBe("2026-11-09");
    expect(sumarDiasHabiles("2026-11-06", 5)).toBe("2026-11-13");
    expect(sumarDiasHabiles("2026-11-04", 2)).toBe("2026-11-06");
  });

  it("con 0 días mueve el fin de semana al lunes", () => {
    expect(sumarDiasHabiles("2026-11-07", 0)).toBe("2026-11-09");
    expect(sumarDiasHabiles("2026-11-05", 0)).toBe("2026-11-05");
  });

  it("cuenta días hábiles entre fechas", () => {
    expect(diasHabilesEntre("2026-11-06", "2026-11-10")).toBe(2);
    expect(diasHabilesEntre("2026-11-06", "2026-11-06")).toBe(0);
  });

  it("hoy en Chile usa la zona America/Santiago", () => {
    // 02:00 UTC del 5 de noviembre es aún 4 de noviembre en Chile.
    expect(hoyChileISO(new Date("2026-11-05T02:00:00Z"))).toBe("2026-11-04");
  });
});
