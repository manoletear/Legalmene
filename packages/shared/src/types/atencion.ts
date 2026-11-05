import { z } from "zod";

export const TipoAtencionEnum = z.enum(["Consulta", "Asesoria", "Juicio"]);
export type TipoAtencion = z.infer<typeof TipoAtencionEnum>;

export const EstadoAtencionEnum = z.enum([
  "Abierta",
  "EnGestion",
  "EnComite",
  "Suspendida",
  "Cerrada",
  "Archivada",
]);
export type EstadoAtencion = z.infer<typeof EstadoAtencionEnum>;

export const AtencionSchema = z.object({
  id: z.string().uuid(),
  correlativo: z.string(),
  codPlan: z.string(),
  afiliadoId: z.string().uuid(),
  tipo: TipoAtencionEnum,
  estado: EstadoAtencionEnum,
  competenciaId: z.string().uuid(),
  materiaId: z.string().uuid(),
  // Línea de asunto del caso (texto libre); la materia es el maestro.
  asunto: z.string().min(1).max(250),
  descripcion: z.string().max(5000).optional().nullable(),
  abogadoAsignadoId: z.string().uuid().optional().nullable(),
  fechaApertura: z.string().datetime(),
  fechaCierre: z.string().datetime().optional().nullable(),
  fechaUltimaGestion: z.string().datetime().optional().nullable(),
  prioridad: z.enum(["Baja", "Media", "Alta", "Urgente"]).default("Media"),
  origen: z.string().max(80).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Atencion = z.infer<typeof AtencionSchema>;

// Respuesta de lectura: incluye los nombres de los maestros para mostrar.
export type AtencionConMaestros = Atencion & { competenciaNombre: string; materiaNombre: string };

// codPlan = plan del afiliado bajo el cual se presta la atención (vigente, o REZAGADO/METLIFE).
// tipo se setea por el path (/consultas, /asesorias, /juicios).
export const CreateAtencionSchema = AtencionSchema.omit({
  id: true,
  correlativo: true,
  tipo: true,
  estado: true,
  fechaApertura: true,
  fechaCierre: true,
  fechaUltimaGestion: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  estado: EstadoAtencionEnum.optional(),
  tipo: TipoAtencionEnum.optional(),
});
export type CreateAtencion = z.infer<typeof CreateAtencionSchema>;

// El plan y el afiliado no cambian después de creada la atención.
export const UpdateAtencionSchema = CreateAtencionSchema.omit({ codPlan: true, afiliadoId: true }).partial();
export type UpdateAtencion = z.infer<typeof UpdateAtencionSchema>;

export const DerivarAtencionSchema = z.object({
  atencionId: z.string().uuid(),
  nuevoTipo: z.enum(["Asesoria", "Juicio"]),
  motivo: z.string().min(5).max(1000),
  abogadoDestinoId: z.string().uuid().optional(),
});
export type DerivarAtencion = z.infer<typeof DerivarAtencionSchema>;
