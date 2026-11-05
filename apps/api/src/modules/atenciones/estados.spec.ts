import { describe, expect, it } from "vitest";
import { ESTADO_INICIAL, ETAPAS_PIPELINE, estadosDeTipo, puedeTransicionar, TRANSICIONES } from "@legalmene/shared";
import { AtencionParaTransicion, validarTransicion } from "./estados";

const base: AtencionParaTransicion = {
  tipo: "Juicio",
  estado: "Asignada",
  tribunalId: null,
  rolCausa: null,
  cuantiaMonto: null,
  cuantiaMoneda: null,
  riesgoMateria: null,
  riesgoCuantia: null,
  riesgoCliente: null,
  revisadoPorComite: false,
  causaTerminoId: null,
};
const sinPendientes = { gestionesPendientes: 0, comitesAbiertos: 0 };

describe("mapa de transiciones", () => {
  it("cada destino pertenece a los estados del tipo", () => {
    for (const tipo of ["Consulta", "Asesoria", "Juicio", "PosesionEfectiva"] as const) {
      const estados = estadosDeTipo(tipo);
      expect(estados).toContain(ESTADO_INICIAL[tipo]);
      for (const destinos of Object.values(TRANSICIONES[tipo])) {
        for (const d of destinos ?? []) expect(estados).toContain(d);
      }
      for (const e of ETAPAS_PIPELINE[tipo]) expect(estados).toContain(e);
    }
  });

  it("consulta: Iniciada → Respondida → Terminada; no a estados de juicio", () => {
    expect(puedeTransicionar("Consulta", "Iniciada", "Respondida")).toBe(true);
    expect(puedeTransicionar("Consulta", "Respondida", "Terminada")).toBe(true);
    expect(puedeTransicionar("Consulta", "Iniciada", "EnGestion")).toBe(false);
  });

  it("estados terminales no tienen salida", () => {
    expect(puedeTransicionar("Juicio", "Terminada", "Pendiente")).toBe(false);
    expect(puedeTransicionar("Asesoria", "Abandonada", "Pendiente")).toBe(false);
  });
});

describe("requisitos por etapa", () => {
  it("juicio a Pendiente exige tribunal, ROL y cuantía", () => {
    const faltan = validarTransicion(base, "Pendiente", sinPendientes);
    expect(faltan).toEqual(["tribunal", "ROL/RIT de la causa", "cuantía y moneda"]);
    const completo = { ...base, tribunalId: "t", rolCausa: "C-1-2026", cuantiaMonto: 100, cuantiaMoneda: "CLP" };
    expect(validarTransicion(completo, "Pendiente", sinPendientes)).toEqual([]);
  });

  it("asesoría a Pendiente no exige datos judiciales", () => {
    expect(validarTransicion({ ...base, tipo: "Asesoria" }, "Pendiente", sinPendientes)).toEqual([]);
  });

  it("Terminada exige causa y sin gestiones ni comité pendientes", () => {
    const enGestion = { ...base, estado: "EnGestion" as const };
    expect(validarTransicion(enGestion, "Terminada", { gestionesPendientes: 2, comitesAbiertos: 1 })).toEqual([
      "causa de término",
      "2 gestión(es) pendiente(s)",
      "comité abierto",
    ]);
    expect(validarTransicion({ ...enGestion, causaTerminoId: "c" }, "Terminada", sinPendientes)).toEqual([]);
  });

  it("Terminada exige rendir las provisiones de fondos", () => {
    const enGestion = { ...base, estado: "EnGestion" as const, causaTerminoId: "c" };
    expect(validarTransicion(enGestion, "Terminada", { ...sinPendientes, provisionesAbiertas: 1 })).toEqual([
      "1 provisión(es) de fondos sin rendir",
    ]);
  });

  it("Abandonada con riesgo ≥ 20 exige revisión de comité", () => {
    const riesgoso = { ...base, causaTerminoId: "c", riesgoMateria: 8, riesgoCuantia: 7, riesgoCliente: 5 };
    expect(validarTransicion(riesgoso, "Abandonada", sinPendientes)).toEqual([
      "revisión de comité (riesgo 20 ≥ 20)",
    ]);
    expect(validarTransicion({ ...riesgoso, revisadoPorComite: true }, "Abandonada", sinPendientes)).toEqual([]);
    expect(validarTransicion({ ...riesgoso, riesgoCliente: 4 }, "Abandonada", sinPendientes)).toEqual([]);
  });

  it("rechaza transiciones no permitidas y el estado Derivada manual", () => {
    expect(validarTransicion(base, "Terminada", sinPendientes)[0]).toMatch(/No se puede pasar/);
    expect(validarTransicion({ ...base, tipo: "Consulta", estado: "Iniciada" }, "Derivada", sinPendientes)[0]).toMatch(
      /derivación/,
    );
  });

  it("el arancel impago bloquea estados de trabajo pero no Abandonada", () => {
    const ctx = { ...sinPendientes, bloqueoArancel: "pago del arancel" };
    const asesoria = { ...base, tipo: "Asesoria" as const };
    expect(validarTransicion(asesoria, "Pendiente", ctx)).toEqual(["pago del arancel"]);
    expect(validarTransicion(asesoria, "EnEsperaArancel", ctx)).toEqual([]);
    expect(validarTransicion({ ...asesoria, causaTerminoId: "c" }, "Abandonada", ctx)).toEqual([]);
  });
});

describe("posesión efectiva", () => {
  const pe: AtencionParaTransicion = { ...base, tipo: "PosesionEfectiva", estado: "Ingresada" };
  const causante = { causanteRut: "11111111-1", causanteNombre: "Causante", causanteFechaDefuncion: "2025-01-01", causanteUltimoDomicilio: "Calle 1" };

  it("Ingresada → En preparación exige los antecedentes del causante", () => {
    const faltan = validarTransicion(pe, "EnPreparacion", { ...sinPendientes, posesion: { causante: null, herederos: 0 } });
    expect(faltan).toEqual(["RUT del causante", "nombre del causante", "fecha de defunción", "último domicilio del causante"]);
    expect(validarTransicion(pe, "EnPreparacion", { ...sinPendientes, posesion: { causante, herederos: 0 } })).toEqual([]);
  });

  it("Lista para emisión exige al menos un heredero", () => {
    const enPrep = { ...pe, estado: "EnPreparacion" as const };
    expect(validarTransicion(enPrep, "ListaEmision", { ...sinPendientes, posesion: { causante, herederos: 0 } })).toEqual(["al menos un heredero"]);
    expect(validarTransicion(enPrep, "ListaEmision", { ...sinPendientes, posesion: { causante, herederos: 2 } })).toEqual([]);
  });

  it("no salta etapas ni termina sin causa de término", () => {
    expect(validarTransicion(pe, "Terminada", sinPendientes)[0]).toMatch(/No se puede pasar/);
    const lista = { ...pe, estado: "ListaEmision" as const };
    expect(validarTransicion(lista, "Terminada", { ...sinPendientes, posesion: { causante, herederos: 1 } })).toEqual(["causa de término"]);
  });
});
