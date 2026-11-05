import { z } from "zod";

// Maestros administrables (Anexo §II.E). `vigente=false` los oculta de los formularios
// pero se conservan para los registros históricos.

const nombre = z.string().trim().min(1).max(200);

export const CompetenciaSchema = z.object({
  id: z.string().uuid(),
  nombre,
  vigente: z.boolean(),
});
export type Competencia = z.infer<typeof CompetenciaSchema>;

export const MateriaSchema = z.object({
  id: z.string().uuid(),
  competenciaId: z.string().uuid(),
  nombre,
  aplicaConsulta: z.boolean(),
  aplicaAsesoria: z.boolean(),
  aplicaJuicio: z.boolean(),
  requiereProvision: z.boolean(),
  vigente: z.boolean(),
});
export type Materia = z.infer<typeof MateriaSchema>;

export const ProcedimientoSchema = z.object({
  id: z.string().uuid(),
  competenciaId: z.string().uuid(),
  nombre,
  vigente: z.boolean(),
});
export type Procedimiento = z.infer<typeof ProcedimientoSchema>;

export const TribunalSchema = z.object({
  id: z.string().uuid(),
  nombre,
  region: z.string().max(80).nullable().optional(),
  comuna: z.string().max(80).nullable().optional(),
  vigente: z.boolean(),
});
export type Tribunal = z.infer<typeof TribunalSchema>;

// Maestros de solo nombre.
export const MaestroSimpleSchema = z.object({
  id: z.string().uuid(),
  nombre,
  vigente: z.boolean(),
});
export type MaestroSimple = z.infer<typeof MaestroSimpleSchema>;

export const MAESTROS_SIMPLES = ["organismos", "tipos-consulta", "causas-termino", "calidades-procesales"] as const;
export type MaestroSimpleTipo = (typeof MAESTROS_SIMPLES)[number];

const sinId = { id: true } as const;

export const CreateCompetenciaSchema = CompetenciaSchema.omit(sinId).partial({ vigente: true });
export const UpdateCompetenciaSchema = CreateCompetenciaSchema.partial();
export type CreateCompetencia = z.infer<typeof CreateCompetenciaSchema>;
export type UpdateCompetencia = z.infer<typeof UpdateCompetenciaSchema>;

export const CreateMateriaSchema = MateriaSchema.omit(sinId).partial({
  aplicaConsulta: true,
  aplicaAsesoria: true,
  aplicaJuicio: true,
  requiereProvision: true,
  vigente: true,
});
export const UpdateMateriaSchema = CreateMateriaSchema.partial();
export type CreateMateria = z.infer<typeof CreateMateriaSchema>;
export type UpdateMateria = z.infer<typeof UpdateMateriaSchema>;

export const CreateProcedimientoSchema = ProcedimientoSchema.omit(sinId).partial({ vigente: true });
export const UpdateProcedimientoSchema = CreateProcedimientoSchema.partial();
export type CreateProcedimiento = z.infer<typeof CreateProcedimientoSchema>;
export type UpdateProcedimiento = z.infer<typeof UpdateProcedimientoSchema>;

export const CreateTribunalSchema = TribunalSchema.omit(sinId).partial({ vigente: true });
export const UpdateTribunalSchema = CreateTribunalSchema.partial();
export type CreateTribunal = z.infer<typeof CreateTribunalSchema>;
export type UpdateTribunal = z.infer<typeof UpdateTribunalSchema>;

export const CreateMaestroSimpleSchema = MaestroSimpleSchema.omit(sinId).partial({ vigente: true });
export const UpdateMaestroSimpleSchema = CreateMaestroSimpleSchema.partial();
export type CreateMaestroSimple = z.infer<typeof CreateMaestroSimpleSchema>;
export type UpdateMaestroSimple = z.infer<typeof UpdateMaestroSimpleSchema>;
