import { z } from "zod";
import { TipoAtencionEnum } from "./atencion";

// Arancel = valor del servicio para una materia (Anexo §IX). Es único para todos los
// planes; lo que cambia por plan es la cobertura (ver cobertura.ts).
export const ArancelSchema = z.object({
  id: z.string().uuid(),
  materiaId: z.string().uuid(),
  // null = aplica a cualquier tipo de atención de la materia.
  tipo: TipoAtencionEnum.nullable(),
  codigo: z.string().trim().min(1).max(30),
  descripcion: z.string().trim().min(1).max(250),
  // UF × 100 (2,5 UF → 250).
  valorUfCentesimas: z.number().int().positive(),
  vigente: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Arancel = z.infer<typeof ArancelSchema>;

// Respuesta de lectura: agrega maestros y el equivalente en pesos con la UF vigente.
export type ArancelConValor = Arancel & {
  valorClp: number | null;
  materiaNombre: string;
  competenciaId: string;
  competenciaNombre: string;
};

export const CreateArancelSchema = ArancelSchema.omit({
  id: true,
  vigente: true,
  createdAt: true,
  updatedAt: true,
}).extend({ tipo: TipoAtencionEnum.nullable().optional() });
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
