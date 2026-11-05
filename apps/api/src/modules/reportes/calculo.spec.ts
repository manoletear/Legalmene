import { describe, expect, it } from "vitest";
import { conteoVacio, mesesDelPeriodo, sumar, tasaUso } from "./calculo";

describe("mesesDelPeriodo", () => {
  it("cubre los meses calendario del período, con su último día", () => {
    expect(mesesDelPeriodo("2024-01-15", "2024-03-02")).toEqual([
      { mes: "2024-01", inicio: "2024-01-01", fin: "2024-01-31" },
      { mes: "2024-02", inicio: "2024-02-01", fin: "2024-02-29" },
      { mes: "2024-03", inicio: "2024-03-01", fin: "2024-03-31" },
    ]);
  });

  it("cruza el cambio de año", () => {
    expect(mesesDelPeriodo("2025-11-01", "2026-02-10").map((m) => m.mes)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("un período dentro de un mes da un solo mes", () => {
    expect(mesesDelPeriodo("2025-06-03", "2025-06-20")).toHaveLength(1);
  });
});

describe("tasaUso", () => {
  it("es atenciones ÷ afiliados vigentes con 4 decimales", () => {
    expect(tasaUso(1, 3)).toBe(0.3333);
    expect(tasaUso(10, 4)).toBe(2.5);
    expect(tasaUso(0, 7)).toBe(0);
  });

  it("es null sin afiliados vigentes (no inventa una tasa)", () => {
    expect(tasaUso(5, 0)).toBeNull();
  });
});

describe("sumar", () => {
  it("acumula por tipo y en el total, ignorando tipos desconocidos", () => {
    const c = conteoVacio();
    sumar(c, "Consulta", 3);
    sumar(c, "Juicio", 2);
    sumar(c, "PosesionEfectiva", 1);
    sumar(c, "Otro", 9);
    expect(c).toEqual({ consultas: 3, asesorias: 0, juicios: 2, posesiones: 1, total: 6 });
  });
});
