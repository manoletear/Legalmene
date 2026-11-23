import { z } from "zod";
import { TipoAtencionEnum } from "./atencion";

// Cobertura de un plan sobre el arancel (Anexo §I.13): precio en UF o % de cobertura.
// materiaId/tipo null = regla por defecto del plan para cualquier materia/tipo.
export const ModalidadCoberturaEnum = z.enum(["Porcentaje", "ValorUF", "SinCobertura"]);
export type ModalidadCobertura = z.infer<typeof ModalidadCoberturaEnum>;

const CoberturaBase = z.object({
  id: z.string().uuid(),
  codPlan: z.string().min(1).max(20),
  materiaId: z.string().uuid().nullable(),
  tipo: TipoAtencionEnum.nullable(),
  modalidad: ModalidadCoberturaEnum,
  // % cubierto por el plan (0–100). Solo modalidad Porcentaje.
  porcentaje: z.number().int().min(0).max(100).nullable(),
  // Precio que paga el afiliado, en UF × 100. Solo modalidad ValorUF.
  valorUfCentesimas: z.number().int().min(0).nullable(),
  vigente: z.boolean(),
});

function validarModalidad(
  c: { modalidad?: ModalidadCobertura; porcentaje?: number | null; valorUfCentesimas?: number | null },
  ctx: z.RefinementCtx,
) {
  if (c.modalidad === "Porcentaje" && (c.porcentaje === null || c.porcentaje === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["porcentaje"], message: "Porcentaje requerido" });
  }
  if (c.modalidad === "ValorUF" && (c.valorUfCentesimas === null || c.valorUfCentesimas === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valorUfCentesimas"], message: "Valor UF requerido" });
  }
}

export const CoberturaSchema = CoberturaBase;
export type Cobertura = z.infer<typeof CoberturaSchema>;
export type CoberturaConMaestros = Cobertura & { materiaNombre: string | null; competenciaNombre: string | null };

export const CreateCoberturaSchema = CoberturaBase.omit({ id: true, vigente: true })
  .extend({
    materiaId: z.string().uuid().nullable().optional(),
    tipo: TipoAtencionEnum.nullable().optional(),
    porcentaje: z.number().int().min(0).max(100).nullable().optional(),
    valorUfCentesimas: z.number().int().min(0).nullable().optional(),
  })
  .superRefine(validarModalidad);
export type CreateCobertura = z.infer<typeof CreateCoberturaSchema>;

export const UpdateCoberturaSchema = CoberturaBase.pick({
  modalidad: true,
  porcentaje: true,
  valorUfCentesimas: true,
  vigente: true,
})
  .partial()
  .superRefine(validarModalidad);
export type UpdateCobertura = z.infer<typeof UpdateCoberturaSchema>;

export interface CopagoResultado {
  arancel: { id: string; codigo: string; descripcion: string; valorUfCentesimas: number } | null;
  cobertura: { id: string; modalidad: ModalidadCobertura; porcentaje: number | null; valorUfCentesimas: number | null } | null;
  modalidad: ModalidadCobertura;
  // Lo que paga el afiliado, en UF × 100. null cuando la materia no tiene arancel.
  copagoUfCentesimas: number | null;
  // Equivalente en pesos con la UF vigente; null si falta UF o arancel.
  copagoClp: number | null;
  requiereCopago: boolean;
}
