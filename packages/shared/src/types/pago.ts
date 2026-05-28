import { z } from "zod";

export const EstadoPagoEnum = z.enum([
  "Iniciado",
  "Autorizado",
  "Rechazado",
  "Anulado",
  "Reembolsado",
]);
export type EstadoPago = z.infer<typeof EstadoPagoEnum>;

export const PagoSchema = z.object({
  id: z.string().uuid(),
  atencionId: z.string().uuid().optional().nullable(),
  afiliadoId: z.string().uuid(),
  codPlan: z.string(),
  monto: z.number().int().nonnegative(),
  moneda: z.string().length(3).default("CLP"),
  estado: EstadoPagoEnum,
  proveedor: z.enum(["WebPay", "Khipu", "Manual"]).default("WebPay"),
  tokenTransaccion: z.string().optional().nullable(),
  ordenCompra: z.string(),
  authCode: z.string().optional().nullable(),
  numeroTarjeta: z.string().max(4).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  fechaIniciado: z.string().datetime(),
  fechaResolucion: z.string().datetime().optional().nullable(),
});
export type Pago = z.infer<typeof PagoSchema>;

export const IniciarPagoSchema = z.object({
  afiliadoId: z.string().uuid(),
  atencionId: z.string().uuid().optional(),
  monto: z.number().int().positive(),
  returnUrl: z.string().url(),
});
export type IniciarPago = z.infer<typeof IniciarPagoSchema>;
