import { z } from "zod";
import { TipoGestionEnum } from "./gestion";

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
  // Provisión de fondos estimada en pesos para informar al cliente (Anexo §VI l.554); null = sin estimación.
  provisionEstimadaClp: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
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
  provisionEstimadaClp: true,
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

// Canales de venta (Anexo §II l.150): maestro de solo nombre.
export const CreateCanalSchema = CreateMaestroSimpleSchema.extend({ nombre: z.string().trim().min(1).max(120) });
export const UpdateCanalSchema = CreateCanalSchema.partial();

// Territorio: regiones y, por región, ciudades y comunas.
const nombreTerritorio = z.string().trim().min(1).max(80);
export const RegionSchema = z.object({ id: z.string().uuid(), nombre: nombreTerritorio, vigente: z.boolean() });
export type Region = z.infer<typeof RegionSchema>;
export const CreateRegionSchema = RegionSchema.omit(sinId).partial({ vigente: true });
export const UpdateRegionSchema = CreateRegionSchema.partial();
export const LugarSchema = z.object({ id: z.string().uuid(), regionId: z.string().uuid(), nombre: nombreTerritorio, vigente: z.boolean() });
export type Lugar = z.infer<typeof LugarSchema>;
export const CreateLugarSchema = LugarSchema.omit(sinId).partial({ vigente: true });
export const UpdateLugarSchema = CreateLugarSchema.partial();
export const UpdateMaestroSimpleSchema = CreateMaestroSimpleSchema.partial();
export type CreateMaestroSimple = z.infer<typeof CreateMaestroSimpleSchema>;
export type UpdateMaestroSimple = z.infer<typeof UpdateMaestroSimpleSchema>;

// Feriados (días hábiles de los plazos del Anexo). "Legal": calculado por ley; "Manual": decreto,
// elecciones u otro que agrega el administrador.
const FechaFeriado = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe tener formato AAAA-MM-DD");
export const FeriadoSchema = z.object({
  id: z.string().uuid(),
  fecha: FechaFeriado,
  nombre: z.string().min(1).max(200),
  origen: z.enum(["Legal", "Manual"]),
  vigente: z.boolean(),
});
export type Feriado = z.infer<typeof FeriadoSchema>;
export const CreateFeriadoSchema = z.object({ fecha: FechaFeriado, nombre: z.string().trim().min(1).max(200) });
export type CreateFeriado = z.infer<typeof CreateFeriadoSchema>;
export const UpdateFeriadoSchema = z.object({ nombre: z.string().trim().min(1).max(200).optional(), vigente: z.boolean().optional() });
export type UpdateFeriado = z.infer<typeof UpdateFeriadoSchema>;

// Tipos de gestión (Anexo §II l.150): maestro editable. La categoría es la del sistema (TipoGestionEnum)
// y define las reglas (gestiones de contacto con arancel impago, escritos para la primera presentación).
export const TipoGestionMaestroSchema = z.object({
  id: z.string().uuid(),
  nombre,
  categoria: TipoGestionEnum,
  vigente: z.boolean(),
});
export type TipoGestionMaestro = z.infer<typeof TipoGestionMaestroSchema>;
export const CreateTipoGestionSchema = TipoGestionMaestroSchema.omit(sinId).partial({ vigente: true });
// La categoría no cambia: definiría otras reglas para las gestiones ya registradas.
export const UpdateTipoGestionSchema = CreateTipoGestionSchema.omit({ categoria: true }).partial().strict();
