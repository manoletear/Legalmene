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

export const ConvocarComiteSchema = ComiteSchema.pick({
  atencionId: true,
  motivo: true,
  fechaSesion: true,
}).extend({
  participantesIds: z.array(z.string().uuid()).min(1),
});
export type ConvocarComite = z.infer<typeof ConvocarComiteSchema>;
