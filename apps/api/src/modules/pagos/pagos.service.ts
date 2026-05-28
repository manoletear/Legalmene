import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { DRIZZLE, Database } from "../../db/database.module";
import { pagos, NuevoPago, Pago } from "../../db/schema/pagos";
import type { IniciarPago } from "@legalmene/shared";

/**
 * MVP de pagos. La integración real con Transbank WebPay se hace en una segunda fase:
 *   - WebpayPlus.Transaction.create() devuelve { token, url }
 *   - El usuario es redirigido a la URL y vuelve por returnUrl
 *   - El callback ejecuta WebpayPlus.Transaction.commit(token) y guarda el authCode
 * Por ahora simulamos el flujo y persistimos el estado en la tabla pagos.
 */
@Injectable()
export class PagosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async iniciar(codPlan: string, input: IniciarPago): Promise<{ pago: Pago; redirectUrl: string }> {
    const ordenCompra = `OC-${ulid()}`;
    const payload: NuevoPago = {
      codPlan,
      afiliadoId: input.afiliadoId,
      atencionId: input.atencionId ?? null,
      monto: input.monto,
      ordenCompra,
      estado: "Iniciado",
      proveedor: "WebPay",
      tokenTransaccion: null,
      metadata: { returnUrl: input.returnUrl },
    };
    const [pago] = await this.db.insert(pagos).values(payload).returning();
    // TODO: invocar SDK Transbank y reemplazar redirectUrl real.
    return {
      pago,
      redirectUrl: `${input.returnUrl}?ordenCompra=${ordenCompra}`,
    };
  }

  async confirmar(ordenCompra: string, authCode: string, exitoso: boolean): Promise<Pago> {
    const [updated] = await this.db
      .update(pagos)
      .set({
        estado: exitoso ? "Autorizado" : "Rechazado",
        authCode,
        fechaResolucion: new Date(),
      })
      .where(eq(pagos.ordenCompra, ordenCompra))
      .returning();
    if (!updated) throw new NotFoundException(`Pago ${ordenCompra} no existe`);
    return updated;
  }
}
