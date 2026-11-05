import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { DRIZZLE, Database } from "../../db/database.module";
import { pagos, NuevoPago, Pago } from "../../db/schema/pagos";
import type { CriteriosBusqueda, IniciarPago } from "@legalmene/shared";
import { rangoFechas, rutComparable } from "../../common/busqueda/criterios";

export interface FiltroPagos extends Pick<CriteriosBusqueda, "rut" | "codPlan" | "fechaDesde" | "fechaHasta"> {
  page?: number;
  pageSize?: number;
  estado?: string;
  ordenCompra?: string;
}

export function condicionPagos(f: FiltroPagos): SQL | undefined {
  const rut = f.rut ? rutComparable(f.rut) : "";
  return and(
    f.codPlan ? eq(pagos.codPlan, f.codPlan) : undefined,
    f.estado ? eq(pagos.estado, f.estado as "Iniciado") : undefined,
    f.ordenCompra ? ilike(pagos.ordenCompra, `%${f.ordenCompra}%`) : undefined,
    rut
      ? sql`${pagos.afiliadoId} in (select a.id from afiliados a where upper(regexp_replace(a.rut, '[^0-9kK]', '', 'g')) like ${`%${rut}%`})`
      : undefined,
    rangoFechas(pagos.fechaIniciado, f.fechaDesde, f.fechaHasta),
  );
}

/**
 * MVP de pagos. Integración real con Transbank WebPay queda pendiente:
 *   - WebpayPlus.Transaction.create() devuelve { token, url }
 *   - El usuario es redirigido y vuelve por returnUrl
 *   - El callback ejecuta WebpayPlus.Transaction.commit(token) y guarda el authCode
 * Por ahora simulamos el flujo y persistimos el estado en la tabla pagos.
 */
@Injectable()
export class PagosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listar(opts: FiltroPagos = {}) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    const where = condicionPagos(opts);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(pagos)
        .where(where)
        .orderBy(desc(pagos.fechaIniciado))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(pagos).where(where),
    ]);
    return {
      data: rows,
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
    };
  }

  async iniciar(input: IniciarPago): Promise<{ pago: Pago; redirectUrl: string }> {
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
