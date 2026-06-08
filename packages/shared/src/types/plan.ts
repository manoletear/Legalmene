import { z } from "zod";

export const PlanSchema = z.object({
  codPlan: z.string().min(1).max(20),
  nombre: z.string().min(1).max(200),
  descripcion: z.string().optional().nullable(),
  vigente: z.boolean().default(true),
  fechaCreacion: z.string().datetime(),
});

export type Plan = z.infer<typeof PlanSchema>;

export const CreatePlanSchema = PlanSchema.omit({ fechaCreacion: true });
export type CreatePlan = z.infer<typeof CreatePlanSchema>;
