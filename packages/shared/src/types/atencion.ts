import { z } from "zod";
import { EstadoAtencionEnum } from "./estados-atencion";

export const TipoAtencionEnum = z.enum(["Consulta", "Asesoria", "Juicio", "PosesionEfectiva"]);
export type TipoAtencion = z.infer<typeof TipoAtencionEnum>;

export const CanalContactoEnum = z.enum(["Telefonico", "Presencial", "Email", "Chat", "Videoconferencia"]);
export type CanalContacto = z.infer<typeof CanalContactoEnum>;

// Cuantía en unidad mínima de la moneda: CLP pesos; UF y UTM centésimas; USD centavos.
export const MonedaCuantiaEnum = z.enum(["CLP", "UF", "UTM", "USD"]);
export type MonedaCuantia = z.infer<typeof MonedaCuantiaEnum>;

const riesgo = z.number().int().min(0).max(10);

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
  // Consultas (Anexo §VI).
  canalContacto: CanalContactoEnum.optional().nullable(),
  tipoConsultaId: z.string().uuid().optional().nullable(),
  codigoGrabacion: z.string().max(120).optional().nullable(),
  horaInicio: z.string().datetime().optional().nullable(),
  horaTermino: z.string().datetime().optional().nullable(),
  respuesta: z.string().max(10000).optional().nullable(),
  // Asesorías y juicios (Anexo §VII–VIII).
  organismoId: z.string().uuid().optional().nullable(),
  procedimientoId: z.string().uuid().optional().nullable(),
  tribunalId: z.string().uuid().optional().nullable(),
  rolCausa: z.string().max(60).optional().nullable(),
  ruc: z.string().max(60).optional().nullable(),
  cuantiaMonto: z.number().int().nonnegative().optional().nullable(),
  cuantiaMoneda: MonedaCuantiaEnum.optional().nullable(),
  calidadProcesalId: z.string().uuid().optional().nullable(),
  riesgoMateria: riesgo.optional().nullable(),
  riesgoCuantia: riesgo.optional().nullable(),
  riesgoCliente: riesgo.optional().nullable(),
  revisadoPorComite: z.boolean().optional(),
  causaTerminoId: z.string().uuid().optional().nullable(),
  // Carga (familiar) del titular por la que se presta la atención, si aplica.
  cargaId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Atencion = z.infer<typeof AtencionSchema>;

// Respuesta de lectura: incluye los nombres de los maestros y el riesgo total.
export type AtencionConMaestros = Atencion & {
  competenciaNombre: string;
  materiaNombre: string;
  riesgoTotal: number;
};

// Ficha de la atención: además trae afiliado, plan y responsable para mostrarlos.
export type FichaAtencion = AtencionConMaestros & {
  afiliado: { rut: string; nombre: string; email: string | null; telefono: string | null };
  // fecha_inicio de la relación RUT–Plan bajo la que se atendió (null si es REZAGADO/METLIFE).
  afiliadoDesde: string | null;
  planNombre: string | null;
  carga: { id: string; rut: string; nombre: string; parentesco: string | null } | null;
  responsable: { id: string; nombre: string; email: string; perfil: string } | null;
};

// Riesgo del juicio = materia + cuantía + cliente (Anexo §VIII); ≥ 20 exige revisión de comité.
export const UMBRAL_RIESGO_COMITE = 20;
export function riesgoTotal(a: { riesgoMateria?: number | null; riesgoCuantia?: number | null; riesgoCliente?: number | null }): number {
  return (a.riesgoMateria ?? 0) + (a.riesgoCuantia ?? 0) + (a.riesgoCliente ?? 0);
}

// codPlan = plan del afiliado bajo el cual se presta la atención (vigente, o REZAGADO/METLIFE).
// tipo se setea por el path (/consultas, /asesorias, /juicios, /posesiones).
export const CreateAtencionSchema = AtencionSchema.omit({
  id: true,
  correlativo: true,
  tipo: true,
  estado: true,
  fechaApertura: true,
  fechaCierre: true,
  fechaUltimaGestion: true,
  horaInicio: true,
  horaTermino: true,
  revisadoPorComite: true,
  causaTerminoId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tipo: TipoAtencionEnum.optional(),
});
export type CreateAtencion = z.infer<typeof CreateAtencionSchema>;

// El plan y el afiliado no cambian después de creada la atención. El estado cambia solo
// por POST /atenciones/:id/estado. revisadoPorComite solo lo marca Supervisor/Administrador.
export const UpdateAtencionSchema = CreateAtencionSchema.omit({ codPlan: true, afiliadoId: true, tipo: true, cargaId: true })
  .partial()
  .extend({ revisadoPorComite: z.boolean().optional() });
export type UpdateAtencion = z.infer<typeof UpdateAtencionSchema>;

// Anexo §VI 3.5.1: otra consulta en la misma llamada (mismo afiliado, plan, canal y grabación).
export const NuevoCorrelativoSchema = z.object({
  competenciaId: z.string().uuid(),
  materiaId: z.string().uuid(),
  asunto: z.string().min(1).max(250),
  tipoConsultaId: z.string().uuid().optional().nullable(),
  respuesta: z.string().max(10000).optional().nullable(),
});
export type NuevoCorrelativo = z.infer<typeof NuevoCorrelativoSchema>;
