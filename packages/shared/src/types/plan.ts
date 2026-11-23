import { z } from "zod";

const FechaPlan = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe tener formato AAAA-MM-DD");

export const PlanSchema = z.object({
  codPlan: z.string().min(1).max(20),
  nombre: z.string().min(1).max(200),
  descripcion: z.string().optional().nullable(),
  canalId: z.string().uuid().optional().nullable(),
  vigente: z.boolean().default(true),
  // Término de vigencia del producto; null = sin término.
  fechaTermino: FechaPlan.nullable().optional(),
  fechaCreacion: z.string().datetime(),
});

export type Plan = z.infer<typeof PlanSchema>;

// Plan con su estado efectivo hoy (vigente y sin término vencido) y cuántas reglas de cobertura tiene.
export type PlanResumen = Plan & { vigenteHoy: boolean; coberturas: number };

export const CreatePlanSchema = PlanSchema.omit({ fechaCreacion: true }).extend({
  codPlan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,20}$/, "Código: letras, números, guion o guion bajo (máx. 20)"),
  nombre: z.string().trim().min(1).max(200),
});
export type CreatePlan = z.infer<typeof CreatePlanSchema>;

// El código no cambia (es la llave de vigencias, coberturas y atenciones).
export const UpdatePlanSchema = CreatePlanSchema.omit({ codPlan: true }).partial();
export type UpdatePlan = z.infer<typeof UpdatePlanSchema>;

// Copia las reglas de cobertura vigentes de otro plan (Anexo §I l.79). Sin `reemplazar`, las reglas
// que el plan destino ya tiene para la misma materia y tipo se conservan.
export const CopiarCoberturasSchema = z.object({
  desde: z.string().min(1).max(20),
  reemplazar: z.boolean().default(false),
});
export type CopiarCoberturas = z.infer<typeof CopiarCoberturasSchema>;
export type CopiarCoberturasResultado = { copiadas: number; omitidas: number };

export const PLANES_SIN_COBERTURA = ["REZAGADO", "METLIFE"] as const;

export const CanalSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1).max(120),
  vigente: z.boolean(),
  createdAt: z.string().datetime(),
});
export type Canal = z.infer<typeof CanalSchema>;
