import type { CriteriosBusqueda } from "@legalmene/shared";
import { condicionAtencion } from "../../common/busqueda/criterios";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ESTADO_PROVISION_LABEL,
  puedeTransicionarProvision,
  type EstadoProvision,
  type EventoFinanciero,
  type MedioPago,
  type RegistrarMovimiento,
  type ResumenProvisionAtencion,
  type SolicitarProvision,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { atenciones } from "../../db/schema/atenciones";
import { usuarios } from "../../db/schema/usuarios";
import {
  provisiones,
  provisionesEventos,
  provisionMovimientos,
  Provision,
  ProvisionMovimiento,
} from "../../db/schema/provisiones";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { diasHabilesEntre, hoyChileISO } from "../../common/utils/dias-habiles";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface FiltroProvisiones extends CriteriosBusqueda {
  page?: number;
  pageSize?: number;
  estado?: EstadoProvision;
}

const ESTADOS_ATENCION_CERRADA: string[] = ["Terminada", "Abandonada", "Derivada"];
const ESTADOS_PROVISIONADOS: EstadoProvision[] = ["Pagada", "EnAprobacion", "Autorizada", "Disponible", "Entregada", "Rendida", "Cerrada"];
// Plazo para retirar fondos disponibles antes de que vuelvan a la compañía (Anexo §X 11.1).
export const DIAS_HABILES_RETIRO = 2;
const clp = (n: number) => "$" + n.toLocaleString("es-CL");

const sumaMov = (tipo: "Gasto" | "Reintegro") =>
  sql<number>`coalesce(sum(${provisionMovimientos.monto}) filter (where ${provisionMovimientos.tipo} = ${tipo}), 0)`;

@Injectable()
export class ProvisionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
  ) {}

  async listar(filtro: FiltroProvisiones = {}) {
    const page = filtro.page ?? 1;
    const pageSize = Math.min(filtro.pageSize ?? 50, 200);
    const where = and(
      filtroAtenciones(),
      condicionAtencion(filtro, provisiones.fechaSolicitud),
      filtro.estado ? eq(provisiones.estado, filtro.estado) : undefined,
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: provisiones.id,
          atencionId: provisiones.atencionId,
          correlativo: atenciones.correlativo,
          asunto: atenciones.asunto,
          monto: provisiones.monto,
          motivo: provisiones.motivo,
          estado: provisiones.estado,
          solicitadaPorEmail: usuarios.email,
          fechaSolicitud: provisiones.fechaSolicitud,
          fechaResolucion: provisiones.fechaResolucion,
          observacionResolucion: provisiones.observacionResolucion,
          montoEntregado: provisiones.montoEntregado,
          fechaDisponible: provisiones.fechaDisponible,
          numeroCheque: provisiones.numeroCheque,
        })
        .from(provisiones)
        .innerJoin(atenciones, eq(provisiones.atencionId, atenciones.id))
        .innerJoin(usuarios, eq(provisiones.solicitadaPorId, usuarios.id))
        .where(where)
        .orderBy(desc(provisiones.fechaSolicitud))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(provisiones)
        .innerJoin(atenciones, eq(provisiones.atencionId, atenciones.id))
        .where(where),
    ]);
    return {
      data: rows,
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
    };
  }

  async listarPorAtencion(atencionId: string) {
    await this.assertAtencion(atencionId);
    const filas = await this.db
      .select()
      .from(provisiones)
      .where(eq(provisiones.atencionId, atencionId))
      .orderBy(desc(provisiones.fechaSolicitud));
    return { data: filas, resumen: await this.resumenAtencion(atencionId) };
  }

  async resumenAtencion(atencionId: string): Promise<ResumenProvisionAtencion> {
    const [t] = await this.db
      .select({
        provisionado: sql<number>`coalesce(sum(${provisiones.monto}) filter (where ${inArray(provisiones.estado, ESTADOS_PROVISIONADOS)}), 0)`,
        entregado: sql<number>`coalesce(sum(${provisiones.montoEntregado}) filter (where ${inArray(provisiones.estado, ["Entregada", "Rendida", "Cerrada"])}), 0)`,
        pendientePago: sql<number>`coalesce(sum(${provisiones.monto}) filter (where ${provisiones.estado} = 'Solicitada'), 0)`,
      })
      .from(provisiones)
      .where(eq(provisiones.atencionId, atencionId));

    const [m] = await this.db
      .select({
        gastos: sumaMov("Gasto"),
        reintegros: sumaMov("Reintegro"),
      })
      .from(provisionMovimientos)
      .innerJoin(provisiones, eq(provisionMovimientos.provisionId, provisiones.id))
      .where(eq(provisiones.atencionId, atencionId));

    // Saldo por rendir: solo provisiones Entregadas (aún no rendidas).
    const abiertas = await this.db
      .select({ id: provisiones.id, montoEntregado: provisiones.montoEntregado })
      .from(provisiones)
      .where(and(eq(provisiones.atencionId, atencionId), eq(provisiones.estado, "Entregada")));
    let saldoPorRendir = 0;
    for (const p of abiertas) saldoPorRendir += await this.saldo(this.db, p.id, p.montoEntregado ?? 0);

    return {
      provisionado: Number(t?.provisionado ?? 0),
      entregado: Number(t?.entregado ?? 0),
      utilizado: Number(m?.gastos ?? 0),
      reintegrado: Number(m?.reintegros ?? 0),
      saldoPorRendir,
      pendientePago: Number(t?.pendientePago ?? 0),
    };
  }

  // Mientras el abogado tenga fondos entregados sin rendir no puede pedir más (Anexo §X 13).
  private async assertSinRendicionPendiente(atencionId: string) {
    const [p] = await this.db
      .select({ n: count() })
      .from(provisiones)
      .where(and(eq(provisiones.atencionId, atencionId), eq(provisiones.estado, "Entregada")));
    if (Number(p?.n ?? 0) > 0) {
      throw new ConflictException("Hay fondos entregados sin rendir en esta atención; rinda la provisión antes de pedir más");
    }
  }

  async solicitar(atencionId: string, usuarioId: string, input: SolicitarProvision): Promise<Provision> {
    const atencion = await this.assertAtencion(atencionId);
    if (ESTADOS_ATENCION_CERRADA.includes(atencion.estado)) {
      throw new BadRequestException(`No se pueden solicitar provisiones en un caso ${atencion.estado}`);
    }
    await this.assertSinRendicionPendiente(atencionId);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(provisiones)
        .values({ atencionId, monto: input.monto, motivo: input.motivo, solicitadaPorId: usuarioId })
        .returning();
      await this.evento(tx, row.id, null, "Solicitada", usuarioId, null);
      return row;
    });
  }

  // Cambio de estado con bloqueo de fila para que dos usuarios no resuelvan la misma etapa.
  private async transicionar(
    id: string,
    hasta: EstadoProvision,
    usuarioId: string | null,
    extra: Partial<typeof provisiones.$inferInsert> = {},
    observacion: string | null = null,
    validar?: (p: Provision, tx: Tx) => Promise<void>,
  ): Promise<Provision> {
    await this.obtener(id);
    const row = await this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(provisiones).where(eq(provisiones.id, id)).for("update");
      if (!p) throw new NotFoundException(`Provisión ${id} no existe`);
      if (!puedeTransicionarProvision(p.estado, hasta)) {
        throw new ConflictException(
          `La provisión está ${ESTADO_PROVISION_LABEL[p.estado].toLowerCase()}; no puede pasar a ${ESTADO_PROVISION_LABEL[hasta].toLowerCase()}`,
        );
      }
      if (validar) await validar(p, tx);
      const [u] = await tx.update(provisiones).set({ ...extra, estado: hasta }).where(eq(provisiones.id, id)).returning();
      await this.evento(tx, id, p.estado, hasta, usuarioId, observacion);
      return u;
    });
    await this.notificar(row, hasta, observacion);
    return row;
  }

  registrarPagoCliente(id: string, usuarioId: string, medio: MedioPago, fecha?: string) {
    return this.transicionar(id, "Pagada", usuarioId, { medioPagoCliente: medio, fechaPagoCliente: fecha ?? hoyChileISO() });
  }

  async solicitarEntrega(id: string, usuarioId: string) {
    const p = await this.obtener(id);
    await this.assertSinRendicionPendiente(p.atencionId);
    return this.transicionar(id, "EnAprobacion", usuarioId);
  }

  autorizar(id: string, usuarioId: string, observacion?: string) {
    return this.transicionar(
      id,
      "Autorizada",
      usuarioId,
      { resueltaPorId: usuarioId, observacionResolucion: observacion ?? null, fechaResolucion: new Date() },
      observacion ?? null,
    );
  }

  // Rechazar la entrega devuelve la provisión a Pagada: el abogado puede volver a pedirla.
  rechazarEntrega(id: string, usuarioId: string, observacion: string) {
    return this.transicionar(
      id,
      "Pagada",
      usuarioId,
      { resueltaPorId: usuarioId, observacionResolucion: observacion, fechaResolucion: new Date() },
      `Entrega rechazada: ${observacion}`,
    );
  }

  marcarDisponible(id: string, usuarioId: string) {
    return this.transicionar(id, "Disponible", usuarioId, { fechaDisponible: new Date() });
  }

  entregar(id: string, usuarioId: string, montoEntregado?: number) {
    return this.transicionar(id, "Entregada", usuarioId, {}, null, async (p, tx) => {
      const monto = montoEntregado ?? p.monto;
      if (monto > p.monto) throw new BadRequestException(`No se puede entregar más de lo provisionado (${clp(p.monto)})`);
      await tx.update(provisiones).set({ montoEntregado: monto, fechaEntrega: new Date() }).where(eq(provisiones.id, p.id));
    });
  }

  // Rendir exige que todo lo entregado esté gastado (con comprobante) o reintegrado.
  rendir(id: string, usuarioId: string) {
    return this.transicionar(id, "Rendida", usuarioId, { fechaRendicion: new Date() }, null, async (p, tx) => {
      const saldo = await this.saldo(tx, p.id, p.montoEntregado ?? 0);
      if (saldo !== 0) {
        throw new BadRequestException(`Queda saldo por rendir (${clp(saldo)}); registre gastos o reintegre el saldo`);
      }
    });
  }

  // Finanzas registra la devolución al cliente (cheque) sobre una provisión rendida.
  async registrarDevolucion(id: string, usuarioId: string, numeroCheque: string, observacion?: string) {
    const p = await this.obtener(id);
    if (!["Rendida", "Cerrada"].includes(p.estado)) {
      throw new ConflictException("La devolución se registra sobre una provisión rendida");
    }
    return this.db.transaction(async (tx) => {
      const [u] = await tx.update(provisiones).set({ numeroCheque }).where(eq(provisiones.id, id)).returning();
      await this.evento(tx, id, p.estado, p.estado, usuarioId, `Devolución al cliente, cheque ${numeroCheque}${observacion ? ` — ${observacion}` : ""}`);
      return u;
    });
  }

  // Disponibles no retirados en 2 días hábiles vuelven a Pagada (Anexo §X 11.1).
  async revertirDisponiblesVencidas(hoy: string = hoyChileISO()): Promise<number> {
    const disponibles = await this.db.select().from(provisiones).where(eq(provisiones.estado, "Disponible"));
    let n = 0;
    for (const p of disponibles) {
      if (!p.fechaDisponible) continue;
      if (diasHabilesEntre(hoyChileISO(p.fechaDisponible), hoy) <= DIAS_HABILES_RETIRO) continue;
      await this.db.transaction(async (tx) => {
        await tx.update(provisiones).set({ estado: "Pagada", fechaDisponible: null }).where(eq(provisiones.id, p.id));
        await this.evento(tx, p.id, "Disponible", "Pagada", null, "Fondos no retirados en el plazo; vuelven a la compañía");
      });
      await this.notificar({ ...p, estado: "Pagada" }, "Pagada", "Fondos no retirados en el plazo de 2 días hábiles", true);
      n++;
    }
    return n;
  }

  async listarMovimientos(provisionId: string): Promise<ProvisionMovimiento[]> {
    await this.obtener(provisionId);
    return this.db
      .select()
      .from(provisionMovimientos)
      .where(eq(provisionMovimientos.provisionId, provisionId))
      .orderBy(desc(provisionMovimientos.fecha));
  }

  // Gastos reales y reintegros de saldo solo sobre fondos entregados; nunca más que el saldo.
  async registrarMovimiento(provisionId: string, usuarioId: string, input: RegistrarMovimiento): Promise<ProvisionMovimiento> {
    await this.obtener(provisionId);
    return this.db.transaction(async (tx) => {
      const [prov] = await tx.select().from(provisiones).where(eq(provisiones.id, provisionId)).for("update");
      if (!prov) throw new NotFoundException(`Provisión ${provisionId} no existe`);
      if (prov.estado !== "Entregada") {
        throw new BadRequestException("Solo se registran gastos y reintegros sobre fondos entregados al abogado");
      }
      const saldo = await this.saldo(tx, provisionId, prov.montoEntregado ?? 0);
      if (input.monto > saldo) {
        const que = input.tipo === "Gasto" ? "El gasto" : "El reintegro";
        throw new BadRequestException(`${que} supera el saldo disponible de la provisión (${clp(saldo)})`);
      }
      const [mov] = await tx
        .insert(provisionMovimientos)
        .values({
          provisionId,
          tipo: input.tipo,
          monto: input.monto,
          glosa: input.glosa,
          documentoId: input.documentoId ?? null,
          registradoPorId: usuarioId,
        })
        .returning();
      return mov;
    });
  }

  async eventos(provisionId: string): Promise<EventoFinanciero[]> {
    await this.obtener(provisionId);
    const rows = await this.db
      .select({
        id: provisionesEventos.id,
        estadoDesde: provisionesEventos.estadoDesde,
        estadoHasta: provisionesEventos.estadoHasta,
        usuarioEmail: usuarios.email,
        observacion: provisionesEventos.observacion,
        fecha: provisionesEventos.fecha,
      })
      .from(provisionesEventos)
      .leftJoin(usuarios, eq(usuarios.id, provisionesEventos.usuarioId))
      .where(eq(provisionesEventos.provisionId, provisionId))
      .orderBy(asc(provisionesEventos.fecha));
    return rows as unknown as EventoFinanciero[];
  }

  private async saldo(db: Database | Tx, provisionId: string, entregado: number): Promise<number> {
    const [m] = await db
      .select({ gastos: sumaMov("Gasto"), reintegros: sumaMov("Reintegro") })
      .from(provisionMovimientos)
      .where(eq(provisionMovimientos.provisionId, provisionId));
    return entregado - Number(m?.gastos ?? 0) - Number(m?.reintegros ?? 0);
  }

  private async evento(
    tx: Tx,
    provisionId: string,
    desde: EstadoProvision | null,
    hasta: EstadoProvision,
    usuarioId: string | null,
    observacion: string | null,
  ) {
    await tx.insert(provisionesEventos).values({ provisionId, estadoDesde: desde, estadoHasta: hasta, usuarioId, observacion });
  }

  // Avisa al abogado que solicitó la provisión (y al jefe que la autorizó, si aplica).
  private async notificar(p: Provision, estado: EstadoProvision, observacion: string | null, incluirJefe = false) {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan, correlativo: atenciones.correlativo })
      .from(atenciones)
      .where(eq(atenciones.id, p.atencionId));
    if (!a) return;
    const destinatarios = new Set([p.solicitadaPorId]);
    if (incluirJefe && p.resueltaPorId) destinatarios.add(p.resueltaPorId);
    for (const usuarioId of destinatarios) {
      await this.notif.crear({
        codPlan: a.codPlan,
        usuarioId,
        severidad: estado === "Disponible" ? "warn" : "info",
        titulo: `Provisión ${a.correlativo}: ${ESTADO_PROVISION_LABEL[estado]}`,
        detalle: observacion ?? `${clp(p.monto)} — ${p.motivo}`,
        accionUrl: `/atenciones/${p.atencionId}`,
        metadata: { provisionId: p.id, estado },
      });
    }
  }

  // 404 si la provisión no existe o pertenece a una atención que el usuario no ve.
  private async obtener(id: string): Promise<Provision> {
    const [row] = await this.db.select().from(provisiones).where(eq(provisiones.id, id));
    if (!row) throw new NotFoundException(`Provisión ${id} no existe`);
    try {
      await this.assertAtencion(row.atencionId);
    } catch {
      throw new NotFoundException(`Provisión ${id} no existe`);
    }
    return row;
  }

  private async assertAtencion(atencionId: string) {
    const [row] = await this.db
      .select({ id: atenciones.id, estado: atenciones.estado })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!row) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return row;
  }
}

// Usado al terminar la atención: provisiones rendidas pasan a Cerrada.
export async function cerrarProvisionesDeAtencion(db: Database, atencionId: string, usuarioId: string | null): Promise<void> {
  const rendidas = await db
    .select({ id: provisiones.id })
    .from(provisiones)
    .where(and(eq(provisiones.atencionId, atencionId), eq(provisiones.estado, "Rendida")));
  for (const p of rendidas) {
    await db.update(provisiones).set({ estado: "Cerrada" }).where(eq(provisiones.id, p.id));
    await db.insert(provisionesEventos).values({ provisionId: p.id, estadoDesde: "Rendida", estadoHasta: "Cerrada", usuarioId, observacion: "Atención terminada" });
  }
}
