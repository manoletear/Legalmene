import { describe, expect, it } from "vitest";
import {
  ESTADOS_ARANCEL_BLOQUEANTES,
  ESTADOS_PROVISION_ABIERTOS,
  EstadoArancelAtencionEnum,
  EstadoProvisionEnum,
  TRANSICIONES_ARANCEL,
  TRANSICIONES_PROVISION,
  puedeTransicionarProvision,
} from "@legalmene/shared";

describe("transiciones de provisión (Anexo §X)", () => {
  it("el camino feliz es Solicitada → Pagada → EnAprobacion → Autorizada → Disponible → Entregada → Rendida", () => {
    const camino = ["Solicitada", "Pagada", "EnAprobacion", "Autorizada", "Disponible", "Entregada", "Rendida"] as const;
    for (let i = 0; i < camino.length - 1; i++) expect(puedeTransicionarProvision(camino[i], camino[i + 1])).toBe(true);
  });

  it("rechazo de entrega y fondos no retirados vuelven a Pagada", () => {
    expect(puedeTransicionarProvision("EnAprobacion", "Pagada")).toBe(true);
    expect(puedeTransicionarProvision("Disponible", "Pagada")).toBe(true);
  });

  it("no se saltan etapas ni se sale de estados finales", () => {
    expect(puedeTransicionarProvision("Solicitada", "Entregada")).toBe(false);
    expect(puedeTransicionarProvision("Pagada", "Autorizada")).toBe(false);
    for (const e of ["RendidaCliente", "Cerrada", "Rechazada"] as const) expect(TRANSICIONES_PROVISION[e]).toEqual([]);
    // Rendida sigue al reingreso del saldo o a la rendición al cliente (Anexo §X 14–20).
    expect(TRANSICIONES_PROVISION.Rendida).toEqual(["Reingresado", "RendidaCliente"]);
    expect(puedeTransicionarProvision("Entregada", "RendidaCliente")).toBe(false);
  });

  it("todo destino es un estado válido y los abiertos excluyen los finales", () => {
    for (const destinos of Object.values(TRANSICIONES_PROVISION)) {
      for (const d of destinos) expect(EstadoProvisionEnum.options).toContain(d);
    }
    expect(ESTADOS_PROVISION_ABIERTOS).not.toContain("Rendida");
    expect(ESTADOS_PROVISION_ABIERTOS).not.toContain("Cerrada");
  });
});

describe("transiciones de arancel (Anexo §IX)", () => {
  it("Requerido → EnAprobacion → Aprobado → Pagado; el rechazo vuelve a Requerido", () => {
    expect(TRANSICIONES_ARANCEL.Requerido).toEqual(["EnAprobacion"]);
    expect(TRANSICIONES_ARANCEL.EnAprobacion).toEqual(["Aprobado", "Requerido"]);
    expect(TRANSICIONES_ARANCEL.Aprobado).toEqual(["Pagado"]);
    expect(TRANSICIONES_ARANCEL.Pagado).toEqual([]);
    expect(TRANSICIONES_ARANCEL.NoRequerido).toEqual([]);
  });

  it("bloquean la atención mientras no esté pagado", () => {
    expect([...ESTADOS_ARANCEL_BLOQUEANTES].sort()).toEqual(["Aprobado", "EnAprobacion", "Requerido"]);
    for (const e of EstadoArancelAtencionEnum.options) {
      if (!ESTADOS_ARANCEL_BLOQUEANTES.includes(e)) expect(["NoRequerido", "Pagado", "Rechazado"]).toContain(e);
    }
  });
});
