import { afterEach, describe, expect, it } from "vitest";
import { domingoDePascua, feriadosLegales, solsticioDeInvierno } from "./feriados-chile";
import { diasHabilesEntre, establecerFeriados, sumarDiasHabiles } from "./dias-habiles";

const fechas = (anio: number) => feriadosLegales(anio).map((f) => f.fecha);

describe("feriados legales de Chile", () => {
  it("Pascua y Semana Santa", () => {
    expect(domingoDePascua(2024)).toBe("2024-03-31");
    expect(domingoDePascua(2025)).toBe("2025-04-20");
    expect(domingoDePascua(2026)).toBe("2026-04-05");
    expect(fechas(2026)).toEqual(expect.arrayContaining(["2026-04-03", "2026-04-04"]));
  });

  it("solsticio de invierno en hora de Chile (Pueblos Indígenas)", () => {
    expect(solsticioDeInvierno(2025)).toBe("2025-06-20");
    expect(solsticioDeInvierno(2026)).toBe("2026-06-21");
    expect(solsticioDeInvierno(2027)).toBe("2027-06-21");
  });

  it("traslado a lunes de San Pedro y San Pablo y del Encuentro de Dos Mundos (Ley 19.668)", () => {
    expect(fechas(2026)).toEqual(expect.arrayContaining(["2026-06-29", "2026-10-12"])); // ya son lunes
    expect(fechas(2027)).toContain("2027-10-11"); // 12 de octubre de 2027 es martes → lunes 11
    expect(fechas(2027)).toContain("2027-06-28"); // 29 de junio de 2027 es martes → lunes 28
    expect(fechas(2025)).toContain("2025-06-29"); // domingo: se mantiene
  });

  it("Fiestas Patrias e Iglesias Evangélicas con sus reglas de traslado", () => {
    expect(fechas(2024)).toContain("2024-09-20"); // 19 jueves → 20 feriado
    expect(fechas(2029)).toContain("2029-09-17"); // 18 martes → 17 feriado
    expect(fechas(2026)).not.toContain("2026-09-17");
    expect(fechas(2023)).toContain("2023-10-27"); // 31 martes → viernes 27
    expect(fechas(2029)).toContain("2029-11-02"); // 31 miércoles → viernes 2
    expect(fechas(2026)).toContain("2026-10-31");
  });

  it("2026 trae 16 feriados nacionales sin repetir", () => {
    const f = fechas(2026);
    expect(new Set(f).size).toBe(f.length);
    expect(f).toHaveLength(16);
  });
});

describe("días hábiles con feriados", () => {
  afterEach(() => establecerFeriados([]));

  it("salta los feriados cargados", () => {
    establecerFeriados(fechas(2026));
    // Jueves 17 de septiembre de 2026 + 1 hábil: 18 (vie) y 19 (sáb) son feriado → lunes 21.
    expect(sumarDiasHabiles("2026-09-17", 1)).toBe("2026-09-21");
    // Viernes Santo 3 de abril de 2026 no es hábil: con 0 días pasa al lunes 6.
    expect(sumarDiasHabiles("2026-04-03", 0)).toBe("2026-04-06");
    expect(diasHabilesEntre("2026-12-24", "2026-12-28")).toBe(1); // 25 es feriado
  });
});
