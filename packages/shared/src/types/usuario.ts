import { z } from "zod";

export const RolUsuarioEnum = z.enum([
  "Administrador",
  "Supervisor",
  "Abogado",
  "Operador",
  "Auditor",
]);
export type RolUsuario = z.infer<typeof RolUsuarioEnum>;

export const UsuarioSchema = z.object({
  id: z.string().uuid(),
  entraOid: z.string(),
  email: z.string().email(),
  nombre: z.string(),
  rol: RolUsuarioEnum,
  codPlanes: z.array(z.string()).default([]),
  activo: z.boolean().default(true),
  ultimoLogin: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Usuario = z.infer<typeof UsuarioSchema>;
