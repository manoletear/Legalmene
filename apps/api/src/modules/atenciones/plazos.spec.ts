import { afterEach, describe, expect, it } from "vitest";
import { calcularPlazos, type DatosPlazos } from "./plazos.service";
import { establecerFeriados } from "../../common/utils/dias-habiles";

// Lunes 2 de noviembre de 2026, 10:00 en Chile (UTC−3).
const lunes = new Date("2026-11-02T13:00:00Z");
const base: DatosPlazos = { tipo: "Juicio", creadaEn: lunes, fechaPrimerContacto: null, arancel: null, primerEscritoEn: null, provisiones: [] };

describe("plazos de la atención", () => {
  afterEach(() => establecerFeriados([]));

  it("consultas y posesiones no tienen estos plazos", () => {
    expect(calcularPlazos({ ...base, tipo: "Consulta" })).toEqual([]);
    expect(calcularPlazos({ ...base, tipo: "PosesionEfectiva" })).toEqual([]);
  });

  it("contacto con el cliente: vence al final del día hábil siguiente", () => {
    const [c] = calcularPlazos(base, new Date("2026-11-03T20:00:00Z"));
    expect(c).toMatchObject({ tipo: "ContactoCliente", estado: "Pendiente" });
    expect(c.limite).toBe("2026-11-04T02:59:00.000Z"); // martes 3, 23:59 en Chile
    expect(calcularPlazos(base, new Date("2026-11-04T12:00:00Z"))[0].estado).toBe("Vencido");
    const cumplido = calcularPlazos({ ...base, fechaPrimerContacto: new Date("2026-11-03T15:00:00Z") }, new Date("2026-11-10T12:00:00Z"));
    expect(cumplido[0].estado).toBe("Cumplido");
    const tarde = calcularPlazos({ ...base, fechaPrimerContacto: new Date("2026-11-05T15:00:00Z") });
    expect(tarde[0].estado).toBe("CumplidoFueraDePlazo");
  });

  it("los feriados alargan el plazo", () => {
    establecerFeriados(["2026-11-03"]);
    expect(calcularPlazos(base)[0].limite).toBe("2026-11-05T02:59:00.000Z"); // miércoles 4
  });

  it("primera presentación: 5 días hábiles desde el pago del arancel, solo en juicios", () => {
    const pendiente = calcularPlazos({ ...base, arancel: { estado: "Requerido", fechaPago: null, creadoEn: lunes } });
    expect(pendiente.map((p) => p.tipo)).toEqual(["ContactoCliente"]); // aún no corre
    const pagado = calcularPlazos(
      { ...base, arancel: { estado: "Pagado", fechaPago: "2026-11-02", creadoEn: lunes } },
      new Date("2026-11-10T12:00:00Z"),
    ).find((p) => p.tipo === "PrimeraPresentacion")!;
    expect(pagado.limite).toBe("2026-11-10T02:59:00.000Z"); // lunes 9, 23:59
    expect(pagado.estado).toBe("Vencido");
    const asesoria = calcularPlazos({ ...base, tipo: "Asesoria", arancel: { estado: "NoRequerido", fechaPago: null, creadoEn: lunes } });
    expect(asesoria.some((p) => p.tipo === "PrimeraPresentacion")).toBe(false);
  });

  it("rendición: 8 días hábiles desde la entrega de cada provisión", () => {
    const r = calcularPlazos(
      { ...base, provisiones: [{ id: "p1", fechaEntrega: lunes, fechaRendicion: null }, { id: "p2", fechaEntrega: null, fechaRendicion: null }] },
      new Date("2026-11-05T12:00:00Z"),
    ).filter((p) => p.tipo === "RendicionFondos");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ referenciaId: "p1", estado: "Pendiente", limite: "2026-11-13T02:59:00.000Z" }); // jueves 12
  });
});
