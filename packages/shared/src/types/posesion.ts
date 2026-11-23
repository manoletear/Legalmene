import { z } from "zod";
import { CreateAtencionSchema } from "./atencion";

// El RUT se valida y normaliza en la API (acepta puntos y guion).
const rut = z.string().trim().min(3).max(14);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe tener formato AAAA-MM-DD");

// Antecedentes del causante de una posesión efectiva. Se pueden guardar incompletos; todos los
// obligatorios se exigen para pasar a "En preparación".
export const CausanteSchema = z.object({
  causanteRut: rut.optional().nullable(),
  causanteNombre: z.string().trim().min(1).max(200).optional().nullable(),
  causanteFechaDefuncion: fecha.optional().nullable(),
  causanteUltimoDomicilio: z.string().trim().min(1).max(250).optional().nullable(),
  causanteComuna: z.string().trim().max(80).optional().nullable(),
  observaciones: z.string().max(5000).optional().nullable(),
});
export type Causante = z.infer<typeof CausanteSchema>;

export const CreatePosesionSchema = CreateAtencionSchema.omit({ tipo: true }).extend({ causante: CausanteSchema.default({}) });
export type CreatePosesion = z.infer<typeof CreatePosesionSchema>;

export const CalidadHerederoEnum = z.enum(["Conyuge", "ConvivienteCivil", "Hijo", "Padre", "Madre", "Hermano", "Otro"]);
export type CalidadHeredero = z.infer<typeof CalidadHerederoEnum>;
export const CALIDAD_HEREDERO_LABEL: Record<CalidadHeredero, string> = {
  Conyuge: "Cónyuge",
  ConvivienteCivil: "Conviviente civil",
  Hijo: "Hijo/a",
  Padre: "Padre",
  Madre: "Madre",
  Hermano: "Hermano/a",
  Otro: "Otro",
};

export const HerederoSchema = z.object({
  rut,
  nombre: z.string().trim().min(1).max(200),
  calidad: CalidadHerederoEnum,
  domicilio: z.string().trim().max(250).optional().nullable(),
  email: z.string().email().optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
});
export type HerederoInput = z.infer<typeof HerederoSchema>;

export interface Heredero {
  id: string;
  atencionId: string;
  rut: string;
  nombre: string;
  calidad: CalidadHeredero;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  createdAt: string;
}

export interface PosesionEfectiva {
  atencionId: string;
  causanteRut: string | null;
  causanteNombre: string | null;
  causanteFechaDefuncion: string | null;
  causanteUltimoDomicilio: string | null;
  causanteComuna: string | null;
  observaciones: string | null;
  herederos: Heredero[];
}

// Lo que falta del causante para preparar la solicitud (vacío si está completo).
export function faltantesCausante(c: Partial<Causante> | null | undefined): string[] {
  const faltan: string[] = [];
  if (!c?.causanteRut) faltan.push("RUT del causante");
  if (!c?.causanteNombre) faltan.push("nombre del causante");
  if (!c?.causanteFechaDefuncion) faltan.push("fecha de defunción");
  if (!c?.causanteUltimoDomicilio) faltan.push("último domicilio del causante");
  return faltan;
}
