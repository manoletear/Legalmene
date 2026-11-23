import { z } from "zod";
import { PermisoEnum } from "./permisos";

export const UsuarioSchema = z.object({
  id: z.string().uuid(),
  entraOid: z.string(),
  email: z.string().email(),
  nombre: z.string(),
  cargo: z.string().nullable(),
  perfilId: z.string().uuid(),
  jefeId: z.string().uuid().nullable(),
  anexo: z.string().nullable(),
  activo: z.boolean().default(true),
  bloqueado: z.boolean().default(false),
  motivoBloqueo: z.string().nullable(),
  ultimoLogin: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Usuario = z.infer<typeof UsuarioSchema>;

// Fila de administración: usuario + perfil y jefe para mostrar.
export type UsuarioAdmin = Usuario & {
  perfilCodigo: string;
  perfilNombre: string;
  jefeNombre: string | null;
};

// /me: usuario autenticado con su perfil y permisos efectivos.
export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string;
  anexo: string | null;
  perfil: { id: string; codigo: string; nombre: string };
  permisos: z.infer<typeof PermisoEnum>[];
}

export const UpdateUsuarioAdminSchema = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  cargo: z.string().trim().max(100).nullable().optional(),
  perfilId: z.string().uuid().optional(),
  jefeId: z.string().uuid().nullable().optional(),
  anexo: z.string().trim().max(10).nullable().optional(),
  activo: z.boolean().optional(),
});
export type UpdateUsuarioAdmin = z.infer<typeof UpdateUsuarioAdminSchema>;

// Alta desde Administración. El usuario entra con enlace de acceso a su correo (o con Microsoft,
// que lo vincula por correo en su primer ingreso).
export const CreateUsuarioAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nombre: z.string().trim().min(1).max(200),
  cargo: z.string().trim().max(100).nullable().optional(),
  perfilId: z.string().uuid(),
  jefeId: z.string().uuid().nullable().optional(),
  anexo: z.string().trim().max(10).nullable().optional(),
});
export type CreateUsuarioAdmin = z.infer<typeof CreateUsuarioAdminSchema>;

export const BloqueoUsuarioSchema = z.object({
  bloqueado: z.boolean(),
  motivo: z.string().trim().max(500).optional(),
});
export type BloqueoUsuario = z.infer<typeof BloqueoUsuarioSchema>;
