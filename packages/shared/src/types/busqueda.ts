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
});
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
