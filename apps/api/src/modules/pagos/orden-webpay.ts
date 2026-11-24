import { ulid } from "ulid";
import type { Database } from "../../db/database.module";
import { pagos, NuevoPago, Pago } from "../../db/schema/pagos";

type DbOTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

// Crea la orden de pago WebPay (stub). Con el SDK de Transbank aquí se llamará a
// WebpayPlus.Transaction.create() y redirectUrl será la URL de pago real.
export async function crearOrdenWebPay(
  db: DbOTx,
  input: { codPlan: string; afiliadoId: string; atencionId?: string | null; monto: number; returnUrl: string; metadata?: Record<string, unknown> },
): Promise<{ pago: Pago; redirectUrl: string }> {
  const ordenCompra = `OC-${ulid()}`;
  const payload: NuevoPago = {
    codPlan: input.codPlan,
    afiliadoId: input.afiliadoId,
    atencionId: input.atencionId ?? null,
    monto: input.monto,
    ordenCompra,
    estado: "Iniciado",
    proveedor: "WebPay",
    tokenTransaccion: null,
    metadata: { ...(input.metadata ?? {}), returnUrl: input.returnUrl },
  };
  const [pago] = await db.insert(pagos).values(payload).returning();
  return { pago, redirectUrl: `${input.returnUrl}?ordenCompra=${ordenCompra}` };
}
