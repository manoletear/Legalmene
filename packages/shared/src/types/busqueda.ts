import { z } from "zod";
import { TipoAtencionEnum } from "./atencion";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");

// Criterios comunes de las búsquedas del Anexo §XI (sin precarga: la UI exige al menos uno).
// Las fechas acotan la fecha propia de cada búsqueda (apertura, solicitud, pago…).
export const CriteriosBusquedaSchema = z.object({
  correlativo: z.string().trim().min(1).optional(),
  rut: z.string().trim().min(1).optional(),
  abogadoId: z.string().uuid().optional(),
  codPlan: z.string().trim().min(1).optional(),
  canalId: z.string().uuid().optional(),
  competenciaId: z.string().uuid().optional(),
  materiaId: z.string().uuid().optional(),
  fechaDesde: fecha.optional(),
  fechaHasta: fecha.optional(),
  // Identificador o descripción de un bien cubierto del afiliado (rol, patente…).
  bien: z.string().trim().min(1).optional(),
  // Tipo de atención (Anexo §IX l.1423, §XI: aranceles y provisiones por tipo).
  tipoAtencion: TipoAtencionEnum.optional(),
});

// Pagos WebPay por tipo (Anexo §XI l.1993): de una atención (arancel) o del plan.
export const TipoPagoEnum = z.enum(["Arancel", "Plan"]);
export type TipoPago = z.infer<typeof TipoPagoEnum>;
export type CriteriosBusqueda = z.infer<typeof CriteriosBusquedaSchema>;

// Una búsqueda sin ningún criterio no se ejecuta (Anexo §XI: "no deberán presentar precarga").
export function tieneCriterios(c: Record<string, unknown>, ignorar: readonly string[] = ["page", "pageSize"]): boolean {
  return Object.entries(c).some(([k, v]) => !ignorar.includes(k) && v !== undefined && v !== null && v !== "");
}

export const MAX_FILAS_EXPORTACION = 50_000;

export const BUSQUEDAS_EXPORTABLES = [
  "afiliados",
  "consultas",
  "asesorias",
  "juicios",
  "derivaciones",
  "aranceles",
  "provisiones",
  "pagos",
  "posesiones",
] as const;
export type BusquedaExportable = (typeof BUSQUEDAS_EXPORTABLES)[number];

// ---- Reportes (§XII–XIII) ----

export const PeriodoSchema = z.object({ desde: fecha, hasta: fecha }).refine((p) => p.desde <= p.hasta, {
  message: "La fecha desde debe ser anterior o igual a la fecha hasta",
});
export type Periodo = z.infer<typeof PeriodoSchema>;

export interface ConteoAtenciones {
  consultas: number;
  asesorias: number;
  juicios: number;
  posesiones: number;
  total: number;
}

export interface FilaReportePlan extends ConteoAtenciones {
  codPlan: string;
  nombre: string;
  canal: string | null;
  afiliadosVigentes: number;
  // atenciones del período / afiliados vigentes del período (null si no hay afiliados).
  tasaUso: number | null;
}

export interface FilaReporteCanal extends ConteoAtenciones {
  canalId: string | null;
  canal: string;
  afiliadosVigentes: number;
  tasaUso: number | null;
  planes: FilaReportePlan[];
}

export interface SerieAfiliadosMes {
  mes: string; // AAAA-MM
  codPlan: string;
  plan: string;
  canal: string | null;
  activos: number;
}

export interface FilaController {
  usuarioId: string;
  nombre: string;
  email: string;
  perfil: string;
  cargo: string | null;
  asignadas: number;
  pendientes: number;
  terminadas: number;
  porEstado: Record<string, number>;
  gestionesPendientes: number;
  gestionesVencidas: number;
  comitesAbiertos: number;
}

// Campos elegibles en el informe de atenciones (§XIII D–G). La clave es la columna del XLSX.
export const CAMPOS_INFORME_ATENCIONES = {
  correlativo: "Correlativo",
  tipo: "Tipo",
  estado: "Estado",
  rut: "RUT afiliado",
  afiliado: "Nombre afiliado",
  plan: "Plan",
  canal: "Canal",
  abogado: "Abogado",
  competencia: "Competencia",
  materia: "Materia",
  asunto: "Asunto",
  fechaApertura: "Fecha inicio",
  fechaCierre: "Fecha término",
  prioridad: "Prioridad",
  codigoGrabacion: "Código grabación",
} as const;
export type CampoInformeAtencion = keyof typeof CAMPOS_INFORME_ATENCIONES;

export const InformeAtencionesSchema = z.object({
  desde: fecha,
  hasta: fecha,
  tipos: z.array(TipoAtencionEnum).min(1, "Seleccione al menos un tipo de atención"),
  campos: z
    .array(z.enum(Object.keys(CAMPOS_INFORME_ATENCIONES) as [CampoInformeAtencion, ...CampoInformeAtencion[]]))
    .min(1, "Seleccione al menos un campo"),
  codPlan: z.string().optional(),
  canalId: z.string().uuid().optional(),
  abogadoId: z.string().uuid().optional(),
});
export type InformeAtenciones = z.infer<typeof InformeAtencionesSchema>;

// Informe de afiliados (§XIII A–C): listado RUT–Plan vigente en el período con los campos elegidos
// y hoja "Resumen" por plan.
export const CAMPOS_INFORME_AFILIADOS = {
  rut: "RUT",
  nombre: "Nombre",
  email: "Correo",
  telefono: "Teléfono",
  direccion: "Dirección",
  comuna: "Comuna",
  ciudad: "Ciudad",
  region: "Región",
  fechaNacimiento: "Fecha de nacimiento",
  codPlan: "Cód. plan",
  plan: "Plan",
  canal: "Canal",
  fechaInicio: "Inicio vigencia",
  fechaTermino: "Término vigencia",
  vigencia: "Estado vigencia",
  vigenteHoy: "Vigente hoy",
} as const;
export type CampoInformeAfiliado = keyof typeof CAMPOS_INFORME_AFILIADOS;

export const InformeAfiliadosSchema = z.object({
  desde: fecha,
  hasta: fecha,
  campos: z
    .array(z.enum(Object.keys(CAMPOS_INFORME_AFILIADOS) as [CampoInformeAfiliado, ...CampoInformeAfiliado[]]))
    .min(1, "Seleccione al menos un campo"),
  codPlan: z.string().optional(),
  canalId: z.string().uuid().optional(),
  rut: z.string().max(12).optional(),
}).refine((p) => p.desde <= p.hasta, { message: "La fecha inicial no puede ser posterior a la final", path: ["hasta"] });
export type InformeAfiliados = z.infer<typeof InformeAfiliadosSchema>;

// Formatos de exportación definidos por el administrador (Anexo §XIII l.2207): columnas y orden
// de cada búsqueda exportable. Sin formato guardado se exportan todas las columnas.
export const FormatoExportacionSchema = z.object({
  columnas: z.array(z.string().trim().min(1).max(80)).min(1).max(80),
});
export type FormatoExportacionInput = z.infer<typeof FormatoExportacionSchema>;
export interface FormatoExportacion {
  clave: BusquedaExportable;
  disponibles: string[];
  // null = sin formato (todas, en el orden del sistema).
  columnas: string[] | null;
  actualizadoEn: string | null;
}

// Controller de asesorías, juicios y consultas (Anexo §XIII l.2418–2460): nómina del plan, materias que
// el plan cubre para ese tipo (no en consultas) y atenciones de esos RUT dentro de la vigencia RUT–plan,
// sin importar el plan con que se registraron. Campos a mostrar elegibles.
export const CAMPOS_CONTROLLER_ATENCIONES = {
  rut: "RUT",
  afiliado: "Afiliado",
  correlativo: "Correlativo",
  planAtencion: "Plan de la atención",
  competencia: "Competencia",
  materia: "Materia",
  asunto: "Asunto",
  estado: "Estado",
  abogado: "Abogado",
  fechaApertura: "Fecha atención",
  fechaCierre: "Fecha término",
  vigenciaInicio: "Inicio vigencia RUT–plan",
  vigenciaTermino: "Término vigencia RUT–plan",
} as const;
export type CampoControllerAtenciones = keyof typeof CAMPOS_CONTROLLER_ATENCIONES;
export const CampoControllerAtencionesEnum = z.enum(Object.keys(CAMPOS_CONTROLLER_ATENCIONES) as [CampoControllerAtenciones, ...CampoControllerAtenciones[]]);
export const ControllerAtencionesSchema = z.object({
  tipo: z.enum(["Consulta", "Asesoria", "Juicio"]),
  codPlan: z.string().trim().min(1),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Separados por coma en la query (?campos=rut,correlativo). Sin campos, todos.
  campos: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v == null ? undefined : (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim()).filter(Boolean)))
    .pipe(z.array(CampoControllerAtencionesEnum).optional()),
});
export type ControllerAtenciones = z.infer<typeof ControllerAtencionesSchema>;
export interface FilaControllerAtencion {
  id: string;
  rut: string;
  afiliado: string;
  correlativo: string;
  planAtencion: string;
  competencia: string;
  materia: string;
  asunto: string;
  estado: string;
  abogado: string | null;
  fechaApertura: string;
  fechaCierre: string | null;
  vigenciaInicio: string;
  vigenciaTermino: string | null;
}
