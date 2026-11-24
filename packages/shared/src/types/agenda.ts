import { z } from "zod";

// Agenda de citas por abogado y jefatura (Anexo §IV l.358, §VI l.662, §VIII l.1130): entrevistas,
// videollamadas y reuniones con el cliente, y audiencias y comparendos para el calendario mensual.
export const TipoCitaEnum = z.enum(["Entrevista", "Videollamada", "Reunion", "Audiencia", "Comparendo", "Otro"]);
export type TipoCita = z.infer<typeof TipoCitaEnum>;
export const TIPO_CITA_LABEL: Record<TipoCita, string> = {
  Entrevista: "Entrevista",
  Videollamada: "Videollamada",
  Reunion: "Reunión",
  Audiencia: "Audiencia",
  Comparendo: "Comparendo",
  Otro: "Otro",
};
// Van al calendario mensual de audiencias y se avisan al Jefe de Procuradores.
export const TIPOS_CITA_JUDICIAL: TipoCita[] = ["Audiencia", "Comparendo"];

export const EstadoCitaEnum = z.enum(["Programada", "Realizada", "Cancelada"]);
export type EstadoCita = z.infer<typeof EstadoCitaEnum>;

const instante = z.string().datetime({ offset: true });

const CitaBase = z.object({
  tipo: TipoCitaEnum,
  titulo: z.string().trim().min(1).max(200),
  inicio: instante,
  fin: instante,
  lugar: z.string().trim().max(300).optional().nullable(),
  responsableId: z.string().uuid(),
  atencionId: z.string().uuid().optional().nullable(),
  afiliadoId: z.string().uuid().optional().nullable(),
  notas: z.string().trim().max(4000).optional().nullable(),
});

const finDespuesDeInicio = (c: { inicio?: string; fin?: string }) => !c.inicio || !c.fin || new Date(c.fin) > new Date(c.inicio);

export const CrearCitaSchema = CitaBase.refine(finDespuesDeInicio, { message: "El término debe ser posterior al inicio", path: ["fin"] });
export type CrearCita = z.infer<typeof CrearCitaSchema>;

// Reprogramar o editar: el afiliado y la atención no cambian.
export const ActualizarCitaSchema = CitaBase.omit({ atencionId: true, afiliadoId: true })
  .partial()
  .refine(finDespuesDeInicio, { message: "El término debe ser posterior al inicio", path: ["fin"] });
export type ActualizarCita = z.infer<typeof ActualizarCitaSchema>;

export const CambiarEstadoCitaSchema = z.object({
  estado: z.enum(["Realizada", "Cancelada"]),
  notas: z.string().trim().max(4000).optional().nullable(),
});
export type CambiarEstadoCita = z.infer<typeof CambiarEstadoCitaSchema>;

export const FiltroAgendaSchema = z
  .object({
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    responsableId: z.string().uuid().optional(),
    tipo: z
      .union([TipoCitaEnum, z.array(TipoCitaEnum)])
      .optional()
      .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
    estado: EstadoCitaEnum.optional(),
    atencionId: z.string().uuid().optional(),
  })
  .refine((f) => f.desde <= f.hasta, { message: "La fecha inicial no puede ser posterior a la final", path: ["hasta"] });
export type FiltroAgenda = z.infer<typeof FiltroAgendaSchema>;

export interface Cita {
  id: string;
  tipo: TipoCita;
  titulo: string;
  inicio: string;
  fin: string;
  lugar: string | null;
  estado: EstadoCita;
  notas: string | null;
  responsableId: string;
  responsableNombre: string;
  atencionId: string | null;
  atencionCorrelativo: string | null;
  afiliadoId: string | null;
  afiliadoNombre: string | null;
  afiliadoRut: string | null;
  creadoPorNombre: string;
  createdAt: string;
}
