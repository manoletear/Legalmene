import { z } from "zod";

export const EstadoProvisionEnum = z.enum(["Solicitada", "Aprobada", "Rechazada"]);
export type EstadoProvision = z.infer<typeof EstadoProvisionEnum>;

export const TipoMovimientoProvisionEnum = z.enum(["Gasto", "Reintegro"]);
export type TipoMovimientoProvision = z.infer<typeof TipoMovimientoProvisionEnum>;

export const ProvisionSchema = z.object({
  id: z.string().uuid(),
  atencionId: z.string().uuid(),
  monto: z.number().int().positive(),
  motivo: z.string().min(3).max(500),
  estado: EstadoProvisionEnum,
  solicitadaPorId: z.string().uuid(),
  resueltaPorId: z.string().uuid().optional().nullable(),
  observacionResolucion: z.string().max(2000).optional().nullable(),
  fechaSolicitud: z.string().datetime(),
  fechaResolucion: z.string().datetime().optional().nullable(),
});
export type Provision = z.infer<typeof ProvisionSchema>;

export const SolicitarProvisionSchema = z.object({
  monto: z.number().int().positive(),
  motivo: z.string().min(3).max(500),
});
export type SolicitarProvision = z.infer<typeof SolicitarProvisionSchema>;

export const ResolverProvisionSchema = z.object({
  observacion: z.string().max(2000).optional(),
});
export type ResolverProvision = z.infer<typeof ResolverProvisionSchema>;

export const MovimientoProvisionSchema = z.object({
  id: z.string().uuid(),
  provisionId: z.string().uuid(),
  tipo: TipoMovimientoProvisionEnum,
  monto: z.number().int().positive(),
  glosa: z.string().min(3).max(300),
  registradoPorId: z.string().uuid(),
  fecha: z.string().datetime(),
});
export type MovimientoProvision = z.infer<typeof MovimientoProvisionSchema>;

export const RegistrarMovimientoSchema = MovimientoProvisionSchema.pick({
  tipo: true,
  monto: true,
  glosa: true,
});
export type RegistrarMovimiento = z.infer<typeof RegistrarMovimientoSchema>;

// Saldo de un caso: solo cuentan provisiones aprobadas.
export interface ResumenProvisionAtencion {
  aprobado: number;
  utilizado: number;
  disponible: number;
  pendiente: number;
}
