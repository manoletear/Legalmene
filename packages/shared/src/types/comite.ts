import { z } from "zod";

export const EstadoComiteEnum = z.enum([
  "Convocado",
  "EnSesion",
  "Cerrado",
  "Cancelado",
]);
export type EstadoComite = z.infer<typeof EstadoComiteEnum>;

export const DecisionComiteEnum = z.enum([
  "Aprobado",
  "Rechazado",
  "Pendiente",
  "Diferido",
]);
export type DecisionComite = z.infer<typeof DecisionComiteEnum>;

export const ComiteSchema = z.object({
  id: z.string().uuid(),
  atencionId: z.string().uuid(),
  estado: EstadoComiteEnum,
  decision: DecisionComiteEnum.default("Pendiente"),
  fechaConvocatoria: z.string().datetime(),
  fechaSesion: z.string().datetime().optional().nullable(),
  fechaCierre: z.string().datetime().optional().nullable(),
  convocadoPor: z.string().uuid(),
  motivo: z.string().min(5).max(2000),
  acta: z.string().max(10000).optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Comite = z.infer<typeof ComiteSchema>;

export const ParticipanteComiteSchema = z.object({
  id: z.string().uuid(),
  comiteId: z.string().uuid(),
  usuarioId: z.string().uuid(),
  rol: z.enum(["Presidente", "Miembro", "Secretario", "Observador"]),
  voto: z.enum(["AFavor", "EnContra", "Abstencion", "Pendiente"]).default("Pendiente"),
  comentario: z.string().max(2000).optional().nullable(),
});
export type ParticipanteComite = z.infer<typeof ParticipanteComiteSchema>;

// Comité con sus participantes y votos (listado de la atención).
export type ComiteConParticipantes = Comite & {
  participantes: { usuarioId: string; nombre: string; rol: ParticipanteComite["rol"]; voto: ParticipanteComite["voto"] }[];
};

export const ConvocarComiteSchema = ComiteSchema.pick({
  atencionId: true,
  motivo: true,
  fechaSesion: true,
}).extend({
  participantesIds: z.array(z.string().uuid()).min(1),
});
export type ConvocarComite = z.infer<typeof ConvocarComiteSchema>;

// Cuerpo de POST /atenciones/:id/comites (el atencionId viene en la ruta).
export const ConvocarComiteBodySchema = ConvocarComiteSchema.omit({ atencionId: true });
export const VotarComiteSchema = z.object({
  voto: z.enum(["AFavor", "EnContra", "Abstencion"]),
  comentario: z.string().max(2000).optional(),
});
export type VotarComite = z.infer<typeof VotarComiteSchema>;
export const CerrarComiteSchema = z.object({
  decision: z.enum(["Aprobado", "Rechazado", "Diferido"]),
  acta: z.string().trim().min(1).max(10000),
});
export type CerrarComite = z.infer<typeof CerrarComiteSchema>;

// Bitácora del comité (Anexo §VII l.951, §VIII l.1142): compromisos con responsable y fecha,
// que se validan (cumplido o no) en el comité siguiente de la misma atención.
export const EstadoCompromisoEnum = z.enum(["Pendiente", "Cumplido", "NoCumplido"]);
export type EstadoCompromiso = z.infer<typeof EstadoCompromisoEnum>;

export const CrearCompromisoSchema = z.object({
  descripcion: z.string().trim().min(1).max(2000),
  responsableId: z.string().uuid(),
  fechaCompromiso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD"),
});
export type CrearCompromiso = z.infer<typeof CrearCompromisoSchema>;

export const ValidarCompromisoSchema = z.object({
  estado: z.enum(["Cumplido", "NoCumplido"]),
  observacion: z.string().trim().max(2000).optional().nullable(),
});
export type ValidarCompromiso = z.infer<typeof ValidarCompromisoSchema>;

export interface CompromisoComite {
  id: string;
  comiteId: string;
  atencionId: string;
  descripcion: string;
  responsableId: string;
  responsableNombre: string;
  fechaCompromiso: string;
  estado: EstadoCompromiso;
  // Vencido: pendiente con la fecha comprometida ya pasada.
  vencido: boolean;
  validadoEnComiteId: string | null;
  validadoPorNombre: string | null;
  validadoAt: string | null;
  observacion: string | null;
  creadoPorNombre: string;
  createdAt: string;
}

// Bitácora de un comité: lo comprometido en él y lo pendiente de comités anteriores que se
// valida en este.
export interface BitacoraComite {
  propios: CompromisoComite[];
  anterioresPorValidar: CompromisoComite[];
}
