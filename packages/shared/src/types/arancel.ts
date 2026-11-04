import { z } from "zod";
import { CompetenciaEnum, TipoAtencionEnum } from "./atencion";

export const ArancelSchema = z.object({
  id: z.string().uuid(),
  codPlan: z.string(),
  codigo: z.string().min(1).max(30),
  descripcion: z.string().min(1).max(250),
  competencia: CompetenciaEnum,
  tipo: TipoAtencionEnum.optional().nullable(),
  // UF × 100 (2,5 UF → 250).
  valorUfCentesimas: z.number().int().positive(),
  vigente: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Arancel = z.infer<typeof ArancelSchema>;

// Respuesta de lectura: agrega el equivalente en pesos con la UF vigente.
export type ArancelConValor = Arancel & { valorClp: number | null };

export const CreateArancelSchema = ArancelSchema.omit({
  id: true,
  codPlan: true,
  vigente: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateArancel = z.infer<typeof CreateArancelSchema>;

export const UpdateArancelSchema = CreateArancelSchema.partial().extend({
  vigente: z.boolean().optional(),
});
export type UpdateArancel = z.infer<typeof UpdateArancelSchema>;

export const ValorUfSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Pesos × 100 (39.123,45 → 3912345).
  valorCentavos: z.number().int().positive(),
});
export type ValorUf = z.infer<typeof ValorUfSchema>;
