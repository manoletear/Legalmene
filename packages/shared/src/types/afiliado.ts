import { z } from "zod";
import { RutSchema } from "./common";

export const VigenciaAfiliadoEnum = z.enum(["Activo", "Inactivo", "Eliminado"]);
export type VigenciaAfiliado = z.infer<typeof VigenciaAfiliadoEnum>;

export const AfiliadoSchema = z.object({
  id: z.string().uuid(),
  rut: RutSchema,
  nombres: z.string().min(1).max(120),
  apellidoPaterno: z.string().min(1).max(80),
  apellidoMaterno: z.string().max(80).optional().nullable(),
  email: z.string().email().optional().nullable(),
  telefono: z.string().max(20).optional().nullable(),
  direccion: z.string().max(250).optional().nullable(),
  comuna: z.string().max(80).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  fechaNacimiento: z.string().date().optional().nullable(),
  vigencia: VigenciaAfiliadoEnum.default("Activo"),
  metadata: z.record(z.unknown()).optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Afiliado = z.infer<typeof AfiliadoSchema>;

// "Eliminado" no se fija por crear/editar: solo DELETE (afiliados.eliminar) lo marca y solo
// POST /afiliados/:id/restaurar (mismo permiso) lo revierte.
export const VigenciaEditableEnum = z.enum(["Activo", "Inactivo"]);

export const CreateAfiliadoSchema = AfiliadoSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  vigencia: VigenciaEditableEnum.optional(),
});
export type CreateAfiliado = z.infer<typeof CreateAfiliadoSchema>;

export const UpdateAfiliadoSchema = CreateAfiliadoSchema.partial();
export type UpdateAfiliado = z.infer<typeof UpdateAfiliadoSchema>;

const FechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe tener formato AAAA-MM-DD");

// Relación RUT–Plan con su vigencia (PlanesAfiliado del Anexo).
export const PlanAfiliadoSchema = z.object({
  id: z.string().uuid(),
  afiliadoId: z.string().uuid(),
  codPlan: z.string(),
  fechaInicio: FechaSchema,
  fechaTermino: FechaSchema.nullable(),
  vigencia: VigenciaAfiliadoEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PlanAfiliado = z.infer<typeof PlanAfiliadoSchema>;

// Plan del afiliado con el nombre del producto y si hoy da derecho a atención.
export type PlanAfiliadoDetalle = PlanAfiliado & { nombrePlan: string; vigente: boolean };

export type AfiliadoConPlanes = Afiliado & { planes: PlanAfiliadoDetalle[] };

export const AsignarPlanSchema = z.object({
  codPlan: z.string().min(1).max(20),
  fechaInicio: FechaSchema,
  fechaTermino: FechaSchema.nullable().optional(),
});
export type AsignarPlan = z.infer<typeof AsignarPlanSchema>;

export const TerminarPlanSchema = z.object({
  fechaTermino: FechaSchema,
});
export type TerminarPlan = z.infer<typeof TerminarPlanSchema>;

export const TipoCargaMasivaEnum = z.enum(["FLUJO", "STOCK"]);
export type TipoCargaMasiva = z.infer<typeof TipoCargaMasivaEnum>;

// Qué se carga: la nómina del plan, las cargas (familiares) o los bienes cubiertos (Anexo §III).
export const EntidadCargaMasivaEnum = z.enum(["afiliados", "cargas", "bienes"]);
export type EntidadCargaMasiva = z.infer<typeof EntidadCargaMasivaEnum>;

export const CargaMasivaResultadoSchema = z.object({
  entidad: EntidadCargaMasivaEnum.default("afiliados"),
  tipo: TipoCargaMasivaEnum,
  codPlan: z.string(),
  totalRegistros: z.number().int(),
  insertados: z.number().int(),
  actualizados: z.number().int(),
  eliminados: z.number().int(),
  errores: z.array(
    z.object({
      fila: z.number().int(),
      mensaje: z.string(),
      datos: z.record(z.unknown()).optional(),
    }),
  ),
  duracionMs: z.number().int(),
});
export type CargaMasivaResultado = z.infer<typeof CargaMasivaResultadoSchema>;

// Carga (familiar) cubierta por la relación RUT–Plan del titular.
export const ParentescoEnum = z.enum(["Conyuge", "ConvivienteCivil", "Hijo", "Padre", "Madre", "Otro"]);
export type Parentesco = z.infer<typeof ParentescoEnum>;
export const PARENTESCO_LABEL: Record<Parentesco, string> = {
  Conyuge: "Cónyuge",
  ConvivienteCivil: "Conviviente civil",
  Hijo: "Hijo/a",
  Padre: "Padre",
  Madre: "Madre",
  Otro: "Otro",
};

export interface CargaAfiliado {
  id: string;
  afiliadoId: string;
  codPlan: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  parentesco: Parentesco | null;
  fechaNacimiento: string | null;
  fechaInicio: string;
  fechaTermino: string | null;
  vigencia: VigenciaAfiliado;
  // Hoy da derecho a atención (vigencia Activo y dentro de fechas, con el plan del titular vigente).
  vigente: boolean;
}

// Bien cubierto por la relación RUT–Plan (p. ej. inmueble o vehículo de un plan hogar/auto).
export const TipoBienEnum = z.enum(["Inmueble", "Vehiculo", "Otro"]);
export type TipoBien = z.infer<typeof TipoBienEnum>;

export interface BienAfiliado {
  id: string;
  afiliadoId: string;
  codPlan: string;
  tipo: TipoBien;
  // Rol SII, patente u otro identificador del bien.
  identificador: string;
  descripcion: string | null;
  comuna: string | null;
  fechaInicio: string;
  fechaTermino: string | null;
  vigencia: VigenciaAfiliado;
  vigente: boolean;
}
