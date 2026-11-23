import type { CopagoResultado, ModalidadCobertura, TipoAtencion } from "@legalmene/shared";

export interface ArancelParaCopago {
  id: string;
  codigo: string;
  descripcion: string;
  valorUfCentesimas: number;
}

export interface CoberturaParaCopago {
  id: string;
  materiaId: string | null;
  tipo: TipoAtencion | null;
  modalidad: ModalidadCobertura;
  porcentaje: number | null;
  valorUfCentesimas: number | null;
}

// Pesos = UF×100 × (pesos×100 por UF) / 10.000, redondeado al peso.
export function ufCentesimasAClp(ufCentesimas: number, ufCentavos: number | null): number | null {
  if (ufCentavos == null) return null;
  return Math.round((ufCentesimas * ufCentavos) / 10_000);
}

// Precedencia: (materia, tipo) → (materia, cualquier tipo) → (cualquier materia, tipo) →
// regla general del plan. Sin regla aplicable el afiliado paga el arancel completo.
export function resolverCobertura<C extends CoberturaParaCopago>(
  coberturas: C[],
  materiaId: string,
  tipo: TipoAtencion,
): C | null {
  const candidatas: [string | null, TipoAtencion | null][] = [
    [materiaId, tipo],
    [materiaId, null],
    [null, tipo],
    [null, null],
  ];
  for (const [m, t] of candidatas) {
    const hit = coberturas.find((c) => c.materiaId === m && c.tipo === t);
    if (hit) return hit;
  }
  return null;
}

export function calcularCopago(input: {
  arancel: ArancelParaCopago | null;
  coberturas: CoberturaParaCopago[];
  materiaId: string;
  tipo: TipoAtencion;
  ufCentavos: number | null;
}): CopagoResultado {
  const cobertura = resolverCobertura(input.coberturas, input.materiaId, input.tipo);
  const modalidad: ModalidadCobertura = cobertura?.modalidad ?? "SinCobertura";
  const arancelUf = input.arancel?.valorUfCentesimas ?? null;

  let copago: number | null;
  if (modalidad === "ValorUF") {
    // El plan fija el precio del servicio, haya o no arancel definido.
    copago = cobertura!.valorUfCentesimas ?? 0;
  } else if (arancelUf === null) {
    copago = null;
  } else if (modalidad === "Porcentaje") {
    copago = Math.round((arancelUf * (100 - (cobertura!.porcentaje ?? 0))) / 100);
  } else {
    copago = arancelUf;
  }

  return {
    arancel: input.arancel
      ? {
          id: input.arancel.id,
          codigo: input.arancel.codigo,
          descripcion: input.arancel.descripcion,
          valorUfCentesimas: input.arancel.valorUfCentesimas,
        }
      : null,
    cobertura: cobertura
      ? {
          id: cobertura.id,
          modalidad: cobertura.modalidad,
          porcentaje: cobertura.porcentaje,
          valorUfCentesimas: cobertura.valorUfCentesimas,
        }
      : null,
    modalidad,
    copagoUfCentesimas: copago,
    copagoClp: copago === null ? null : ufCentesimasAClp(copago, input.ufCentavos),
    requiereCopago: copago !== null && copago > 0,
  };
}
