import { accesoActual } from "../../common/acceso/contexto";
import { ConflictException, Inject, Injectable, Logger, NotFoundException, Optional, forwardRef } from "@nestjs/common";
import { and, count, desc, eq, getTableColumns, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { afiliados } from "../../db/schema/afiliados";
import { DRIZZLE, Database } from "../../db/database.module";
import { pagos, Pago } from "../../db/schema/pagos";
import type { CriteriosBusqueda, IniciarPago, TipoPago } from "@legalmene/shared";
import { rangoFechas, rutComparable } from "../../common/busqueda/criterios";
import { asegurarAtencionVisible, filtroAtenciones } from "../../common/acceso/alcance";
import { atenciones } from "../../db/schema/atenciones";
import { ArancelesAtencionService } from "../coberturas/aranceles-atencion.service";
import { crearOrdenWebPay } from "./orden-webpay";

// Un pago ligado a una atención solo se ve si esa atención es visible para el usuario.
export function alcancePagos(): SQL | undefined {
  const filtro = filtroAtenciones();
  if (!filtro) return undefined;
  return or(isNull(pagos.atencionId), sql`${pagos.atencionId} in (select ${atenciones.id} from ${atenciones} where ${filtro})`);
}

export interface FiltroPagos extends Pick<CriteriosBusqueda, "rut" | "codPlan" | "fechaDesde" | "fechaHasta"> {
  tipoPago?: TipoPago;
  page?: number;
  pageSize?: number;
  estado?: string;
  ordenCompra?: string;
}

export function condicionPagos(f: FiltroPagos): SQL | undefined {
  const rut = f.rut ? rutComparable(f.rut) : "";
  return and(
    alcancePagos(),
    f.codPlan ? eq(pagos.codPlan, f.codPlan) : undefined,
    f.tipoPago === "Arancel" ? isNotNull(pagos.atencionId) : f.tipoPago === "Plan" ? isNull(pagos.atencionId) : undefined,
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
  private readonly logger = new Logger(PagosService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Optional() @Inject(forwardRef(() => ArancelesAtencionService)) private readonly aranceles?: ArancelesAtencionService,
  ) {}

  async listar(opts: FiltroPagos = {}) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    const where = condicionPagos(opts);
    const [rows, [{ value: total }]] = await Promise.all([
      // Columnas del Anexo §XI l.1996: orden, fecha, nombre, RUT, monto, tipo, código, correo, región, comuna.
      this.db
        .select({
          ...getTableColumns(pagos),
          rut: afiliados.rut,
          nombre: sql<string>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno}`,
          email: afiliados.email,
          region: afiliados.region,
          comuna: afiliados.comuna,
        })
        .from(pagos)
        .leftJoin(afiliados, eq(afiliados.id, pagos.afiliadoId))
        .where(where)
        .orderBy(desc(pagos.fechaIniciado))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(pagos).where(where),
    ]);
    // Datos personales del afiliado solo para quien puede ver afiliados.
    const acceso = accesoActual();
    const verAfiliados = !acceso || acceso.permisos.has("afiliados.ver");
    return {
      data: verAfiliados ? rows : rows.map((r) => ({ ...r, rut: null, nombre: null, email: null, region: null, comuna: null })),
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
    };
  }

  async iniciar(input: IniciarPago): Promise<{ pago: Pago; redirectUrl: string }> {
    if (input.atencionId) await asegurarAtencionVisible(this.db, input.atencionId);
    return crearOrdenWebPay(this.db, input);
  }

  // Solo un pago Iniciado se resuelve, una vez: los ya resueltos no se reescriben (409).
  async confirmar(ordenCompra: string, authCode: string, exitoso: boolean): Promise<Pago> {
    const [updated] = await this.db
      .update(pagos)
      .set({
        estado: exitoso ? "Autorizado" : "Rechazado",
        authCode,
        fechaResolucion: new Date(),
      })
      .where(and(eq(pagos.ordenCompra, ordenCompra), eq(pagos.estado, "Iniciado")))
      .returning();
    if (!updated) {
      const [existe] = await this.db.select({ estado: pagos.estado }).from(pagos).where(eq(pagos.ordenCompra, ordenCompra));
      if (existe) throw new ConflictException(`El pago ${ordenCompra} ya fue resuelto (${existe.estado})`);
      throw new NotFoundException(`Pago ${ordenCompra} no existe`);
    }
    // Orden de un arancel (Notificar Pago): el pago lo deja Pagado sin registro manual (Anexo §IX 4.1).
    if (exitoso && updated.atencionId && updated.metadata?.arancelAtencionId && this.aranceles) {
      await this.aranceles.pagoWebPay(updated).catch((e) => this.logger.error(`No se pudo registrar el pago WebPay ${ordenCompra} en el arancel: ${e}`));
    }
    return updated;
  }
}
