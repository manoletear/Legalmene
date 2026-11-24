import { z } from "zod";

export const TipoGestionEnum = z.enum([
  "LlamadaTelefonica",
  "Email",
  "Reunion",
  "EscritoJudicial",
  "Audiencia",
  "Notificacion",
  "AnalisisDocumental",
  "Resolucion",
  "Otra",
]);
export type TipoGestion = z.infer<typeof TipoGestionEnum>;

export const TIPO_GESTION_LABEL: Record<TipoGestion, string> = {
  LlamadaTelefonica: "Llamada telefónica",
  Email: "Correo electrónico",
  Reunion: "Reunión / entrevista",
  EscritoJudicial: "Escrito judicial",
  Audiencia: "Audiencia",
  Notificacion: "Notificación",
  AnalisisDocumental: "Análisis documental",
  Resolucion: "Resolución",
  Otra: "Otra",
};

export const EstadoGestionEnum = z.enum([
  "Pendiente",
  "Completada",
  "Vencida",
  "Cancelada",
]);
export type EstadoGestion = z.infer<typeof EstadoGestionEnum>;

export const GestionSchema = z.object({
  id: z.string().uuid(),
  atencionId: z.string().uuid(),
  tipo: TipoGestionEnum,
  estado: EstadoGestionEnum,
  titulo: z.string().min(1).max(200),
  detalle: z.string().max(5000).optional().nullable(),
  responsableId: z.string().uuid(),
  fechaProgramada: z.string().datetime().optional().nullable(),
  fechaCompromiso: z.string().datetime().optional().nullable(),
  fechaEjecucion: z.string().datetime().optional().nullable(),
  resultado: z.string().max(2000).optional().nullable(),
  documentosIds: z.array(z.string().uuid()).default([]),
  // Informar al cliente por correo el inicio y el término (Anexo §VII l.1015, §VIII l.1105).
  informarCliente: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Gestion = z.infer<typeof GestionSchema>;

export const CreateGestionSchema = GestionSchema.omit({
  id: true,
  estado: true,
  fechaEjecucion: true,
  resultado: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  estado: EstadoGestionEnum.optional(),
});
export type CreateGestion = z.infer<typeof CreateGestionSchema>;

// Estados desde los que una gestión puede completarse.
export const ESTADOS_GESTION_ABIERTA: EstadoGestion[] = ["Pendiente", "Vencida"];

export const CompletarGestionSchema = z.object({
  resultado: z.string().min(1).max(2000),
  documentosIds: z.array(z.string().uuid()).optional(),
  // Fecha real de término (Anexo §VII l.860, §VIII l.1122). Sin ella se usa el momento actual.
  fechaEjecucion: z.string().datetime().optional(),
});
export type CompletarGestion = z.infer<typeof CompletarGestionSchema>;
