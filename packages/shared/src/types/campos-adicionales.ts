import { z } from "zod";
import { TipoAtencionEnum } from "./atencion";

// Campos que el administrador agrega para ciertos procedimientos o materias (Anexo §XIII l.2396).
// Los valores viven en la atención (atenciones.campos_adicionales, por id de campo).
export const TipoCampoAdicionalEnum = z.enum(["Texto", "Numero", "Fecha", "Opcion", "SiNo"]);
export type TipoCampoAdicional = z.infer<typeof TipoCampoAdicionalEnum>;
export const TIPO_CAMPO_LABEL: Record<TipoCampoAdicional, string> = {
  Texto: "Texto",
  Numero: "Número",
  Fecha: "Fecha",
  Opcion: "Lista de opciones",
  SiNo: "Sí / No",
};

const CampoBase = z.object({
  etiqueta: z.string().trim().min(1).max(120),
  tipoDato: TipoCampoAdicionalEnum,
  opciones: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  obligatorio: z.boolean().default(false),
  // A qué atenciones aplica: tipo (opcional) y materia o procedimiento (al menos uno).
  tipoAtencion: TipoAtencionEnum.nullable().optional(),
  materiaId: z.string().uuid().nullable().optional(),
  procedimientoId: z.string().uuid().nullable().optional(),
  orden: z.number().int().min(0).max(999).default(0),
});

export const CrearCampoAdicionalSchema = CampoBase.refine((c) => !!c.materiaId || !!c.procedimientoId, {
  message: "Indique la materia o el procedimiento al que aplica",
  path: ["materiaId"],
}).refine((c) => c.tipoDato !== "Opcion" || (c.opciones?.length ?? 0) > 0, {
  message: "Una lista de opciones necesita al menos una opción",
  path: ["opciones"],
});
export type CrearCampoAdicional = z.infer<typeof CrearCampoAdicionalSchema>;

export const ActualizarCampoAdicionalSchema = z.object({
  etiqueta: z.string().trim().min(1).max(120).optional(),
  opciones: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  obligatorio: z.boolean().optional(),
  orden: z.number().int().min(0).max(999).optional(),
  vigente: z.boolean().optional(),
});
export type ActualizarCampoAdicional = z.infer<typeof ActualizarCampoAdicionalSchema>;

export interface CampoAdicional {
  id: string;
  etiqueta: string;
  tipoDato: TipoCampoAdicional;
  opciones: string[] | null;
  obligatorio: boolean;
  tipoAtencion: z.infer<typeof TipoAtencionEnum> | null;
  materiaId: string | null;
  procedimientoId: string | null;
  orden: number;
  vigente: boolean;
}

export type ValorCampoAdicional = string | number | boolean | null;
export const GuardarCamposAdicionalesSchema = z.object({
  valores: z.record(z.string().uuid(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])),
});
export type GuardarCamposAdicionales = z.infer<typeof GuardarCamposAdicionalesSchema>;

// Campos que aplican a una atención, con su valor actual.
export interface CamposDeAtencion {
  campos: CampoAdicional[];
  valores: Record<string, ValorCampoAdicional>;
}
