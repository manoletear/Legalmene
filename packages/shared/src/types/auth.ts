import { z } from "zod";

// Login con enlace de acceso (magic link).
export const SolicitarEnlaceSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo no válido").max(200),
});
export type SolicitarEnlace = z.infer<typeof SolicitarEnlaceSchema>;

export const VerificarEnlaceSchema = z.object({
  token: z.string().trim().min(20).max(200),
});
export type VerificarEnlace = z.infer<typeof VerificarEnlaceSchema>;

export interface SolicitudEnlaceResultado {
  ok: true;
  // Solo en modo demo (AUTH_DISABLED): el enlace se devuelve en vez de enviarse por correo.
  enlaceDemo?: string;
}

export interface SesionIniciada {
  token: string;
  expiraEn: string;
}

export const MINUTOS_VALIDEZ_ENLACE = 15;
export const HORAS_VALIDEZ_SESION = 8;
