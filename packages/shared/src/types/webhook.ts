import { z } from "zod";

export const EVENTOS_WEBHOOK = ["atencion.creada", "atencion.estado", "atencion.derivada"] as const;

// Cabeceras que define el sistema y que una suscripción no puede reemplazar.
const CABECERAS_RESERVADAS = /^(content-type|content-length|host|x-legalmene-.*)$/i;

export const UrlWebhookSchema = z
  .string()
  .trim()
  .url("URL no válida")
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), "Solo se permiten URLs http(s)");

export const CrearWebhookSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  url: UrlWebhookSchema,
  eventos: z.array(z.enum(EVENTOS_WEBHOOK)).min(1).max(EVENTOS_WEBHOOK.length),
  headers: z
    .record(z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "Nombre de cabecera no válido"), z.string().max(500))
    .refine((h) => Object.keys(h).length <= 10, "Máximo 10 cabeceras")
    .refine((h) => !Object.keys(h).some((k) => CABECERAS_RESERVADAS.test(k)), "Cabecera reservada")
    .optional(),
});
export type CrearWebhook = z.infer<typeof CrearWebhookSchema>;

export const ActualizarWebhookSchema = CrearWebhookSchema.partial().extend({ activo: z.boolean().optional() });
export type ActualizarWebhook = z.infer<typeof ActualizarWebhookSchema>;
