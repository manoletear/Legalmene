import { describe, expect, it } from "vitest";
import { calcularCopago, resolverCobertura, ufCentesimasAClp, type CoberturaParaCopago } from "./copago";

const MAT = "00000000-0000-0000-0000-00000000000a";
const OTRA = "00000000-0000-0000-0000-00000000000b";
const arancel = { id: "ar", codigo: "A-LAB-01", descripcion: "Despido", valorUfCentesimas: 1200 };

function cob(over: Partial<CoberturaParaCopago>): CoberturaParaCopago {
  return { id: "c", materiaId: null, tipo: null, modalidad: "SinCobertura", porcentaje: null, valorUfCentesimas: null, ...over };
}

describe("resolverCobertura", () => {
  const reglas = [
    cob({ id: "general", modalidad: "Porcentaje", porcentaje: 10 }),
    cob({ id: "tipo", tipo: "Juicio", modalidad: "Porcentaje", porcentaje: 20 }),
    cob({ id: "materia", materiaId: MAT, modalidad: "Porcentaje", porcentaje: 30 }),
    cob({ id: "exacta", materiaId: MAT, tipo: "Juicio", modalidad: "Porcentaje", porcentaje: 40 }),
  ];

  it("prefiere materia+tipo, luego materia, luego tipo, luego la regla general", () => {
    expect(resolverCobertura(reglas, MAT, "Juicio")?.id).toBe("exacta");
    expect(resolverCobertura(reglas, MAT, "Consulta")?.id).toBe("materia");
    expect(resolverCobertura(reglas, OTRA, "Juicio")?.id).toBe("tipo");
    expect(resolverCobertura(reglas, OTRA, "Asesoria")?.id).toBe("general");
  });

  it("devuelve null si el plan no tiene reglas aplicables", () => {
    expect(resolverCobertura([cob({ materiaId: OTRA })], MAT, "Juicio")).toBeNull();
  });
});

describe("calcularCopago", () => {
  const base = { arancel, materiaId: MAT, tipo: "Juicio" as const, ufCentavos: 3_904_000 };

  it("Porcentaje: el afiliado paga la parte no cubierta, redondeada", () => {
    const r = calcularCopago({ ...base, coberturas: [cob({ modalidad: "Porcentaje", porcentaje: 75 })] });
    expect(r.copagoUfCentesimas).toBe(300);
    expect(r.copagoClp).toBe(117_120);
    expect(r.requiereCopago).toBe(true);

    const tercio = calcularCopago({ ...base, arancel: { ...arancel, valorUfCentesimas: 1000 }, coberturas: [cob({ modalidad: "Porcentaje", porcentaje: 33 })] });
    expect(tercio.copagoUfCentesimas).toBe(670);
  });

  it("Porcentaje 100: sin copago", () => {
    const r = calcularCopago({ ...base, coberturas: [cob({ modalidad: "Porcentaje", porcentaje: 100 })] });
    expect(r.copagoUfCentesimas).toBe(0);
    expect(r.requiereCopago).toBe(false);
  });

  it("ValorUF: el plan fija el precio aunque no haya arancel", () => {
    const r = calcularCopago({ ...base, arancel: null, coberturas: [cob({ modalidad: "ValorUF", valorUfCentesimas: 250 })] });
    expect(r.copagoUfCentesimas).toBe(250);
    expect(r.modalidad).toBe("ValorUF");
  });

  it("Sin regla o SinCobertura: paga el arancel completo", () => {
    expect(calcularCopago({ ...base, coberturas: [] }).copagoUfCentesimas).toBe(1200);
    expect(calcularCopago({ ...base, coberturas: [] }).modalidad).toBe("SinCobertura");
    expect(calcularCopago({ ...base, coberturas: [cob({ modalidad: "SinCobertura" })] }).copagoUfCentesimas).toBe(1200);
  });

  it("sin arancel y sin precio del plan: copago desconocido", () => {
    const r = calcularCopago({ ...base, arancel: null, coberturas: [cob({ modalidad: "Porcentaje", porcentaje: 50 })] });
    expect(r.copagoUfCentesimas).toBeNull();
    expect(r.copagoClp).toBeNull();
    expect(r.requiereCopago).toBe(false);
  });

  it("sin UF cargada no informa pesos", () => {
    const r = calcularCopago({ ...base, ufCentavos: null, coberturas: [] });
    expect(r.copagoUfCentesimas).toBe(1200);
    expect(r.copagoClp).toBeNull();
  });
});

describe("ufCentesimasAClp", () => {
  it("12 UF a $41.268,88 = $495.227", () => {
    expect(ufCentesimasAClp(1200, 4_126_888)).toBe(495_227);
  });
});
