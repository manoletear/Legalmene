import { z } from "zod";
import { RutSchema } from "./common";

export const VigenciaAfiliadoEnum = z.enum(["Activo", "Inactivo", "Eliminado"]);
export type VigenciaAfiliado = z.infer<typeof VigenciaAfiliadoEnum>;

export const AfiliadoSchema = z.object({
  id: z.string().uuid(),
  codPlan: z.string().min(1),
  rut: RutSchema,
  nombres: z.string().min(1).max(120),
  apellidoPaterno: z.string().min(1).max(80),
  apellidoMaterno: z.string().max(80).optional().nullable(),
  email: z.string().email().optional().nullable(),
  telefono: z.string().max(20).optional().nullable(),
  direccion: z.string().max(250).optional().nullable(),
  comuna: z.string().max(80).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  fechaNacimiento: z.string().date().optional().nullable(),
  vigencia: VigenciaAfiliadoEnum.default("Activo"),
  fechaIngreso: z.string().datetime(),
  fechaEgreso: z.string().datetime().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Afiliado = z.infer<typeof AfiliadoSchema>;

export const CreateAfiliadoSchema = AfiliadoSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  fechaIngreso: z.string().datetime().optional(),
  vigencia: VigenciaAfiliadoEnum.optional(),
});
export type CreateAfiliado = z.infer<typeof CreateAfiliadoSchema>;

export const UpdateAfiliadoSchema = CreateAfiliadoSchema.partial();
export type UpdateAfiliado = z.infer<typeof UpdateAfiliadoSchema>;

export const TipoCargaMasivaEnum = z.enum(["FLUJO", "STOCK"]);
export type TipoCargaMasiva = z.infer<typeof TipoCargaMasivaEnum>;

export const CargaMasivaResultadoSchema = z.object({
  tipo: TipoCargaMasivaEnum,
  codPlan: z.string(),
  totalRegistros: z.number().int(),
  insertados: z.number().int(),
  actualizados: z.number().int(),
  eliminados: z.number().int(),
  errores: z.array(
    z.object({
      fila: z.number().int(),
      mensaje: z.string(),
      datos: z.record(z.unknown()).optional(),
    }),
  ),
  duracionMs: z.number().int(),
});
export type CargaMasivaResultado = z.infer<typeof CargaMasivaResultadoSchema>;
