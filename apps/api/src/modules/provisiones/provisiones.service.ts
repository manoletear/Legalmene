import { plantillaAviso } from "../correos/plantillas";
import { CorreosService } from "../correos/correos.service";
import { documentos } from "../../db/schema/documentos";
import type { CriteriosBusqueda } from "@legalmene/shared";
import { avisar, jefeDe, usuariosConPermiso as conPermiso } from "../notif-inbox/destinatarios";
import { condicionAtencion } from "../../common/busqueda/criterios";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  ESTADO_PROVISION_LABEL,
  puedeTransicionarProvision,
  type EstadoProvision,
  type EventoFinanciero,
  type MedioPago,
  type RegistrarMovimiento,
  type CuentaCorrienteAbogado,
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
  rendicionesCliente,
  Provision,
  ProvisionMovimiento,
  type RendicionClienteRow,
} from "../../db/schema/provisiones";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { diasHabilesEntre, hoyChileISO, instanteChile, sumarDiasHabiles } from "../../common/utils/dias-habiles";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface FiltroProvisiones extends CriteriosBusqueda {
  page?: number;
  pageSize?: number;
  estado?: EstadoProvision;
}

const ESTADOS_ATENCION_CERRADA: string[] = ["Terminada", "Abandonada", "Derivada"];
const ESTADOS_PROVISIONADOS: EstadoProvision[] = ["Pagada", "EnAprobacion", "Autorizada", "Disponible", "Entregada", "Rendida", "Reingresado", "RendidaCliente", "Cerrada"];

// Saldo de una provisión (entregado − gastos − reintegros), como SQL sobre la fila de provisiones.
const saldoProvisionSql = sql<number>`(coalesce(${provisiones.montoEntregado}, 0) - coalesce((select sum(m.monto) from provision_movimientos m where m.provision_id = ${provisiones.id}), 0))`;

// Provisión con fondos aún en manos del abogado: entregada sin rendir, o rendida con saldo que
// el contador todavía no recibe (reingreso pendiente). Impide pedir más fondos y terminar.
export function condicionFondosPendientes(): SQL {
  return or(eq(provisiones.estado, "Entregada"), and(eq(provisiones.estado, "Rendida"), sql`${saldoProvisionSql} > 0`))!;
}
// Plazo para retirar fondos disponibles antes de que vuelvan a la compañía (Anexo §X 11.1).
export const DIAS_HABILES_RETIRO = 2;

// Anexo §X l.1673: la entrega al abogado ocurre desde las 15:00 del día hábil siguiente a la
// autorización.
export function entregaPermitidaDesde(fechaAutorizacion: Date | null): Date | null {
  if (!fechaAutorizacion) return null;
  return instanteChile(sumarDiasHabiles(hoyChileISO(fechaAutorizacion), 1), "15:00");
}
const clp = (n: number) => "$" + n.toLocaleString("es-CL");

const sumaMov = (tipo: "Gasto" | "Reintegro") =>
  sql<number>`coalesce(sum(${provisionMovimientos.monto}) filter (where ${provisionMovimientos.tipo} = ${tipo}), 0)`;

@Injectable()
export class ProvisionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
    @Optional() @Inject(CorreosService) private readonly correos?: CorreosService,
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
        entregado: sql<number>`coalesce(sum(${provisiones.montoEntregado}) filter (where ${inArray(provisiones.estado, ["Entregada", "Rendida", "Reingresado", "RendidaCliente", "Cerrada"])}), 0)`,
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

    const c = await this.cuenta(atencionId);
    const r = await this.rendicionActual(atencionId);
    return {
      provisionado: Number(t?.provisionado ?? 0),
      entregado: Number(t?.entregado ?? 0),
      utilizado: Number(m?.gastos ?? 0),
      reintegrado: Number(m?.reintegros ?? 0),
      saldoPorRendir,
      pendientePago: Number(t?.pendientePago ?? 0),
      saldoCuenta: c.saldo,
      pendienteReingreso: c.pendienteReingreso,
      rendidoCliente: c.devuelto,
      rendicion: r
        ? {
            ...r,
            solicitadaEn: r.solicitadaEn.toISOString(),
            chequeEn: r.chequeEn?.toISOString() ?? null,
            entregadaEn: r.entregadaEn?.toISOString() ?? null,
          }
        : null,
    };
  }

  // Mientras el abogado tenga fondos sin rendir o sin reingresar no puede pedir más (Anexo §X 13–14).
  private async assertSinRendicionPendiente(atencionId: string) {
    const [p] = await this.db
      .select({ n: count() })
      .from(provisiones)
      .where(and(eq(provisiones.atencionId, atencionId), condicionFondosPendientes()));
    if (Number(p?.n ?? 0) > 0) {
      throw new ConflictException("Hay fondos entregados sin rendir o con saldo sin reingresar en esta atención; regularícelos antes de pedir más");
    }
  }

  // Con una rendición al cliente en curso (solicitada o con cheque emitido) la cuenta queda
  // congelada: no se piden ni entregan fondos, o el mismo saldo iría al cliente y al abogado.
  private async asegurarSinRendicionEnCurso(atencionId: string, tx: Tx | Database = this.db) {
    const [r] = await tx
      .select({ id: rendicionesCliente.id })
      .from(rendicionesCliente)
      .where(and(eq(rendicionesCliente.atencionId, atencionId), inArray(rendicionesCliente.estado, ["Solicitada", "ChequeEmitido"])))
      .limit(1);
    if (r) throw new ConflictException("Hay una rendición al cliente en curso: no se piden ni entregan fondos hasta terminarla");
  }

  async solicitar(atencionId: string, usuarioId: string, input: SolicitarProvision): Promise<Provision> {
    const atencion = await this.assertAtencion(atencionId);
    if (ESTADOS_ATENCION_CERRADA.includes(atencion.estado)) {
      throw new BadRequestException(`No se pueden solicitar provisiones en un caso ${atencion.estado}`);
    }
    await this.assertSinRendicionPendiente(atencionId);
    await this.asegurarSinRendicionEnCurso(atencionId);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(provisiones)
        .values({ atencionId, monto: input.monto, motivo: input.motivo, solicitadaPorId: usuarioId })
        .returning();
      await this.evento(tx, row.id, null, "Solicitada", usuarioId, null);
      return row;
    }).then(async (row) => {
      await this.notificar(row, "Solicitada", null, usuarioId);
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
    await this.notificar(row, hasta, observacion, usuarioId);
    return row;
  }

  registrarPagoCliente(id: string, usuarioId: string, medio: MedioPago, fecha?: string, datos: { cuotas?: number; referencia?: string } = {}) {
    return this.transicionar(id, "Pagada", usuarioId, {
      medioPagoCliente: medio,
      fechaPagoCliente: fecha ?? hoyChileISO(),
      cuotasPagoCliente: datos.cuotas ?? null,
      referenciaPagoCliente: datos.referencia || null,
    });
  }

  async solicitarEntrega(id: string, usuarioId: string) {
    const p = await this.obtener(id);
    await this.assertSinRendicionPendiente(p.atencionId);
    await this.asegurarSinRendicionEnCurso(p.atencionId);
    return this.transicionar(id, "EnAprobacion", usuarioId);
  }

  // Cuatro ojos (Anexo: la jefatura aprueba lo que piden sus colaboradores): quien pidió la
  // provisión o su entrega no puede resolverla.
  private async asegurarOtroAprobador(p: Provision, usuarioId: string, tx: Tx): Promise<void> {
    if (p.solicitadaPorId === usuarioId) {
      throw new ForbiddenException("Quien solicitó la provisión no puede autorizar ni rechazar su entrega");
    }
    const [pedido] = await tx
      .select({ usuarioId: provisionesEventos.usuarioId })
      .from(provisionesEventos)
      .where(and(eq(provisionesEventos.provisionId, p.id), eq(provisionesEventos.estadoHasta, "EnAprobacion")))
      .orderBy(desc(provisionesEventos.fecha))
      .limit(1);
    if (pedido?.usuarioId === usuarioId) {
      throw new ForbiddenException("Quien pidió la entrega no puede autorizarla ni rechazarla");
    }
  }

  autorizar(id: string, usuarioId: string, observacion?: string) {
    return this.transicionar(
      id,
      "Autorizada",
      usuarioId,
      { resueltaPorId: usuarioId, observacionResolucion: observacion ?? null, fechaResolucion: new Date() },
      observacion ?? null,
      (p, tx) => this.asegurarOtroAprobador(p, usuarioId, tx),
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
      (p, tx) => this.asegurarOtroAprobador(p, usuarioId, tx),
    );
  }

  marcarDisponible(id: string, usuarioId: string) {
    return this.transicionar(id, "Disponible", usuarioId, { fechaDisponible: new Date() });
  }

  entregar(id: string, usuarioId: string, montoEntregado?: number) {
    return this.transicionar(id, "Entregada", usuarioId, {}, null, async (p, tx) => {
      await this.asegurarSinRendicionEnCurso(p.atencionId, tx);
      const desde = entregaPermitidaDesde(p.fechaResolucion);
      if (desde && Date.now() < desde.getTime()) {
        throw new BadRequestException(
          `Los fondos se entregan desde las 15:00 del día hábil siguiente a la autorización (${desde.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })})`,
        );
      }
      const monto = montoEntregado ?? p.monto;
      if (monto > p.monto) throw new BadRequestException(`No se puede entregar más de lo provisionado (${clp(p.monto)})`);
      // Dentro de la transacción: dos entregas pedidas antes no pueden quedar ambas entregadas.
      const [pendientes] = await tx
        .select({ n: count() })
        .from(provisiones)
        .where(and(eq(provisiones.atencionId, p.atencionId), eq(provisiones.estado, "Entregada")));
      if (Number(pendientes?.n ?? 0) > 0) {
        throw new ConflictException("Hay fondos entregados sin rendir en esta atención; rinda la provisión antes de entregar más");
      }
      await tx.update(provisiones).set({ montoEntregado: monto, fechaEntrega: new Date() }).where(eq(provisiones.id, p.id));
    });
  }

  // El abogado rinde con sus gastos (con comprobante). Si queda saldo, la provisión queda a la
  // espera de que lo devuelva y el contador registre el reingreso (Anexo §X 13–14).
  rendir(id: string, usuarioId: string) {
    return this.transicionar(id, "Rendida", usuarioId, { fechaRendicion: new Date() }, null, async (p, tx) => {
      const saldo = await this.saldo(tx, p.id, p.montoEntregado ?? 0);
      if (saldo < 0) throw new BadRequestException("Los gastos superan lo entregado");
    });
  }

  // El contador recibe el saldo no gastado y lo registra: la provisión queda "Reingresado" y se
  // habilitan nuevas solicitudes de fondos (Anexo §X 14). El monto debe ser el saldo exacto.
  registrarReingreso(id: string, usuarioId: string, monto: number, glosa?: string) {
    return this.transicionar(id, "Reingresado", usuarioId, {}, `Reingreso de ${clp(monto)}`, async (p, tx) => {
      const saldo = await this.saldo(tx, p.id, p.montoEntregado ?? 0);
      if (saldo <= 0) throw new ConflictException("La provisión no tiene saldo por reingresar");
      if (monto !== saldo) throw new BadRequestException(`El reingreso debe ser el saldo no gastado (${clp(saldo)})`);
      await tx.insert(provisionMovimientos).values({
        provisionId: p.id,
        tipo: "Reintegro",
        monto,
        glosa: glosa ?? "Saldo no gastado devuelto por el abogado",
        registradoPorId: usuarioId,
      });
    });
  }

  // Cuenta corriente por abogado (Anexo §X 12): provisiones autorizadas, disponibles, entregadas o
  // con saldo por reingresar, agrupadas por quien las solicitó. Acotada al alcance del usuario.
  async cuentaCorriente(abogadoId?: string): Promise<CuentaCorrienteAbogado[]> {
    const filas = await this.db
      .select({
        id: provisiones.id,
        atencionId: provisiones.atencionId,
        correlativo: atenciones.correlativo,
        motivo: provisiones.motivo,
        estado: provisiones.estado,
        monto: provisiones.monto,
        montoEntregado: provisiones.montoEntregado,
        saldo: saldoProvisionSql,
        fechaEntrega: provisiones.fechaEntrega,
        abogadoId: provisiones.solicitadaPorId,
        abogadoNombre: usuarios.nombre,
      })
      .from(provisiones)
      .innerJoin(atenciones, eq(atenciones.id, provisiones.atencionId))
      .innerJoin(usuarios, eq(usuarios.id, provisiones.solicitadaPorId))
      .where(
        and(
          filtroAtenciones(),
          abogadoId ? eq(provisiones.solicitadaPorId, abogadoId) : undefined,
          or(inArray(provisiones.estado, ["Autorizada", "Disponible"]), condicionFondosPendientes()),
        ),
      )
      .orderBy(asc(usuarios.nombre), asc(provisiones.fechaSolicitud));
    const porAbogado = new Map<string, CuentaCorrienteAbogado>();
    for (const f of filas) {
      let c = porAbogado.get(f.abogadoId);
      if (!c) {
        c = { abogadoId: f.abogadoId, abogadoNombre: f.abogadoNombre, porEntregar: 0, porRendir: 0, porReingresar: 0, provisiones: [] };
        porAbogado.set(f.abogadoId, c);
      }
      const saldo = Number(f.saldo);
      if (f.estado === "Autorizada" || f.estado === "Disponible") c.porEntregar += f.monto;
      else if (f.estado === "Entregada") c.porRendir += saldo;
      else c.porReingresar += saldo;
      c.provisiones.push({
        id: f.id,
        atencionId: f.atencionId,
        correlativo: f.correlativo,
        motivo: f.motivo,
        estado: f.estado,
        monto: f.monto,
        montoEntregado: f.montoEntregado,
        saldo: f.estado === "Autorizada" || f.estado === "Disponible" ? f.monto : saldo,
        fechaEntrega: f.fechaEntrega?.toISOString() ?? null,
      });
    }
    return [...porAbogado.values()];
  }

  // --- Rendición de fondos al cliente (Anexo §X 16–20) ---

  // Saldo de la cuenta de la atención: lo pagado por el cliente menos los gastos y lo ya devuelto.
  async cuenta(atencionId: string) {
    const [t] = await this.db
      .select({ pagado: sql<number>`coalesce(sum(${provisiones.monto}) filter (where ${inArray(provisiones.estado, ESTADOS_PROVISIONADOS)}), 0)` })
      .from(provisiones)
      .where(eq(provisiones.atencionId, atencionId));
    const [m] = await this.db
      .select({ gastos: sumaMov("Gasto") })
      .from(provisionMovimientos)
      .innerJoin(provisiones, eq(provisionMovimientos.provisionId, provisiones.id))
      .where(eq(provisiones.atencionId, atencionId));
    const [r] = await this.db
      .select({ devuelto: sql<number>`coalesce(sum(${rendicionesCliente.monto}) filter (where ${rendicionesCliente.estado} <> 'Solicitada'), 0)` })
      .from(rendicionesCliente)
      .where(eq(rendicionesCliente.atencionId, atencionId));
    const [pend] = await this.db
      .select({ n: sql<number>`coalesce(sum(${saldoProvisionSql}) filter (where ${provisiones.estado} = 'Rendida'), 0)` })
      .from(provisiones)
      .where(eq(provisiones.atencionId, atencionId));
    const pagado = Number(t?.pagado ?? 0);
    const gastos = Number(m?.gastos ?? 0);
    const devuelto = Number(r?.devuelto ?? 0);
    return { pagado, gastos, devuelto, saldo: pagado - gastos - devuelto, pendienteReingreso: Math.max(0, Number(pend?.n ?? 0)) };
  }

  async rendicionActual(atencionId: string): Promise<RendicionClienteRow | null> {
    const [r] = await this.db
      .select()
      .from(rendicionesCliente)
      .where(eq(rendicionesCliente.atencionId, atencionId))
      .orderBy(desc(rendicionesCliente.solicitadaEn))
      .limit(1);
    return r ?? null;
  }

  // Paso 16: el abogado pide rendir al cliente; se avisa a Finanzas y al contador.
  async solicitarRendicionCliente(atencionId: string, usuarioId: string): Promise<RendicionClienteRow> {
    const atencion = await this.assertAtencion(atencionId);
    const c = await this.cuenta(atencionId);
    if (c.saldo <= 0) throw new ConflictException("La cuenta de la atención no tiene saldo que rendir al cliente");
    const [row] = await this.db
      .insert(rendicionesCliente)
      .values({ atencionId, solicitadaPorId: usuarioId })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException("Ya hay una rendición al cliente en curso para esta atención");
    // Anexo §X 17: aviso y correo a EF y EC.
    const destinatarios = await this.usuariosConPermiso(["provisiones.disponer_entregar", "provisiones.registrar_pago"]);
    await avisar(
      this.notif,
      destinatarios,
      {
        codPlan: atencion.codPlan,
        severidad: "warn",
        titulo: `Rendición al cliente: ${atencion.correlativo}`,
        detalle: `Emitir cheque de devolución por ${clp(c.saldo)}`,
        accionUrl: `/atenciones/${atencionId}`,
      },
      usuarioId,
      { servicio: this.correos, atencionId, plantilla: "rendicion.solicitada" },
    );
    return row;
  }

  // Paso 18: Finanzas emite el cheque por el total del saldo (la cuenta queda en cero). No procede
  // si hay fondos en manos del abogado o entregas en curso.
  async registrarChequeDevolucion(atencionId: string, usuarioId: string, numeroCheque: string, observacion?: string): Promise<RendicionClienteRow> {
    const atencion = await this.assertAtencion(atencionId);
    const actual = await this.rendicionActual(atencionId);
    if (!actual || actual.estado !== "Solicitada") throw new ConflictException("No hay una rendición al cliente solicitada");
    const [enCurso] = await this.db
      .select({ n: count() })
      .from(provisiones)
      .where(
        and(
          eq(provisiones.atencionId, atencionId),
          or(inArray(provisiones.estado, ["EnAprobacion", "Autorizada", "Disponible"]), condicionFondosPendientes()),
        ),
      );
    if (Number(enCurso?.n ?? 0) > 0) {
      throw new ConflictException("Hay fondos por rendir o reingresar, o entregas en curso; regularícelos antes de emitir el cheque");
    }
    const c = await this.cuenta(atencionId);
    if (c.saldo <= 0) throw new ConflictException("La cuenta de la atención no tiene saldo que devolver");
    const [row] = await this.db
      .update(rendicionesCliente)
      .set({ estado: "ChequeEmitido", monto: c.saldo, numeroCheque, observacion: observacion ?? null, chequePorId: usuarioId, chequeEn: new Date() })
      .where(and(eq(rendicionesCliente.id, actual.id), eq(rendicionesCliente.estado, "Solicitada")))
      .returning();
    if (!row) throw new ConflictException("La rendición ya fue procesada");
    // Aviso al abogado que la pidió y a su jefatura: el cheque está disponible para retiro.
    const [sol] = await this.db.select({ jefeId: usuarios.jefeId }).from(usuarios).where(eq(usuarios.id, actual.solicitadaPorId));
    await avisar(
      this.notif,
      [actual.solicitadaPorId, sol?.jefeId],
      {
        codPlan: atencion.codPlan,
        severidad: "info",
        titulo: `Cheque de devolución disponible: ${atencion.correlativo}`,
        detalle: `Cheque ${numeroCheque} por ${clp(c.saldo)}`,
        accionUrl: `/atenciones/${atencionId}`,
      },
      usuarioId,
      { servicio: this.correos, atencionId, plantilla: "rendicion.cheque" },
    );
    return row;
  }

  // Paso 20: entregado el cheque al cliente, el abogado marca "rendido a cliente" y todas las
  // provisiones con fondos pasan a "Rendida al cliente".
  async marcarRendidoCliente(atencionId: string, usuarioId: string): Promise<RendicionClienteRow> {
    await this.assertAtencion(atencionId);
    const actual = await this.rendicionActual(atencionId);
    if (!actual || actual.estado !== "ChequeEmitido") throw new ConflictException("El cheque de devolución aún no está emitido");
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(rendicionesCliente)
        .set({ estado: "Entregada", entregadaPorId: usuarioId, entregadaEn: new Date() })
        .where(and(eq(rendicionesCliente.id, actual.id), eq(rendicionesCliente.estado, "ChequeEmitido")))
        .returning();
      if (!row) throw new ConflictException("La rendición ya fue marcada como entregada");
      // Nada debió moverse desde el cheque: sin entregas en curso ni fondos en manos del abogado.
      const [enCurso] = await tx
        .select({ n: count() })
        .from(provisiones)
        .where(
          and(
            eq(provisiones.atencionId, atencionId),
            or(inArray(provisiones.estado, ["EnAprobacion", "Autorizada", "Disponible", "Entregada"]), condicionFondosPendientes()),
          ),
        );
      if (Number(enCurso?.n ?? 0) > 0) throw new ConflictException("Hay fondos en curso desde que se emitió el cheque; regularícelos antes");
      const provs = await tx
        .select({ id: provisiones.id, estado: provisiones.estado })
        .from(provisiones)
        .where(and(eq(provisiones.atencionId, atencionId), inArray(provisiones.estado, ["Pagada", "Rendida", "Reingresado"])));
      for (const p of provs) {
        await tx.update(provisiones).set({ estado: "RendidaCliente", numeroCheque: actual.numeroCheque }).where(eq(provisiones.id, p.id));
        await this.evento(tx, p.id, p.estado, "RendidaCliente", usuarioId, `Rendido a cliente con cheque ${actual.numeroCheque}`);
      }
      return row;
    });
  }

  private usuariosConPermiso(permisosBuscados: string[]): Promise<string[]> {
    return conPermiso(this.db, permisosBuscados);
  }

  private async recordarRetiro(p: Provision) {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan, correlativo: atenciones.correlativo })
      .from(atenciones)
      .where(eq(atenciones.id, p.atencionId));
    if (!a) return;
    const jefe = await jefeDe(this.db, p.solicitadaPorId);
    const avisados: string[] = [];
    for (const usuarioId of new Set([p.solicitadaPorId, jefe].filter((x): x is string => !!x))) {
      const creada = await this.notif.crearSiNoExisteUnseen(
        {
          codPlan: a.codPlan,
          usuarioId,
          severidad: "warn",
          titulo: `Retire hoy los fondos de ${a.correlativo}`,
          detalle: `${clp(p.monto)}: si no se retiran hoy, mañana vuelven a la compañía`,
          accionUrl: `/atenciones/${p.atencionId}`,
          metadata: { recordatorioRetiro: p.id },
        },
        "recordatorioRetiro",
        p.id,
      );
      if (creada) avisados.push(usuarioId);
    }
    if (avisados.length && this.correos) {
      await this.correos.aUsuarios(
        avisados,
        plantillaAviso({
          titulo: `Retire hoy los fondos de ${a.correlativo}`,
          detalle: `${clp(p.monto)}: si no se retiran hoy, mañana vuelven a la compañía`,
          url: this.correos.url(`/atenciones/${p.atencionId}`),
        }),
        { plantilla: "provision.recordatorioRetiro", atencionId: p.atencionId },
      );
    }
  }

  // Disponibles no retirados en 2 días hábiles vuelven a Pagada (Anexo §X 11.1).
  async revertirDisponiblesVencidas(hoy: string = hoyChileISO()): Promise<number> {
    const disponibles = await this.db.select().from(provisiones).where(eq(provisiones.estado, "Disponible"));
    let n = 0;
    for (const p of disponibles) {
      if (!p.fechaDisponible) continue;
      const transcurridos = diasHabilesEntre(hoyChileISO(p.fechaDisponible), hoy);
      // Último día hábil del plazo: recordatorio al abogado y su jefatura (Anexo §X 11.1).
      if (transcurridos === DIAS_HABILES_RETIRO) await this.recordarRetiro(p);
      if (transcurridos <= DIAS_HABILES_RETIRO) continue;
      // Solo si sigue Disponible con la misma fecha: una entrega hecha mientras corre el job gana.
      const revertida = await this.db.transaction(async (tx) => {
        const [u] = await tx
          .update(provisiones)
          .set({ estado: "Pagada", fechaDisponible: null })
          .where(and(eq(provisiones.id, p.id), eq(provisiones.estado, "Disponible"), eq(provisiones.fechaDisponible, p.fechaDisponible!)))
          .returning({ id: provisiones.id });
        if (!u) return false;
        await this.evento(tx, p.id, "Disponible", "Pagada", null, "Fondos no retirados en el plazo; vuelven a la compañía");
        return true;
      });
      if (!revertida) continue;
      await this.notificar({ ...p, estado: "Pagada" }, "Pagada", "Fondos no retirados en el plazo de 2 días hábiles", null, true);
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
      if (input.tipo !== "Gasto") {
        throw new BadRequestException("El saldo no gastado lo registra el contador al recibirlo (reingreso)");
      }
      if (prov.estado !== "Entregada") {
        throw new BadRequestException("Solo se registran gastos sobre fondos entregados al abogado");
      }
      const saldo = await this.saldo(tx, provisionId, prov.montoEntregado ?? 0);
      if (input.monto > saldo) {
        throw new BadRequestException(`El gasto supera el saldo disponible de la provisión (${clp(saldo)})`);
      }
      // Anexo §X 13: cada gasto real se respalda con su comprobante, subido a la misma atención.
      if (!input.documentoId) throw new BadRequestException("Adjunte el comprobante del gasto");
      const [doc] = await tx
        .select({ id: documentos.id })
        .from(documentos)
        .where(and(eq(documentos.id, input.documentoId), eq(documentos.atencionId, prov.atencionId)));
      if (!doc) throw new BadRequestException("El comprobante no corresponde a un documento de esta atención");
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

  // Avisos del flujo de provisiones (Anexo §X), según la etapa: al contador al solicitar y al
  // rendir; al abogado y su jefatura al pagarse y quedar disponible; a la jefatura al pedir la
  // entrega; a Finanzas (EF/GAF) al autorizarse y si los fondos vuelven por no retirarse. Nunca a
  // quien hizo la acción.
  private async notificar(p: Provision, estado: EstadoProvision, observacion: string | null, actorId: string | null, reversion = false) {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan, correlativo: atenciones.correlativo })
      .from(atenciones)
      .where(eq(atenciones.id, p.atencionId));
    if (!a) return;
    const abogado = p.solicitadaPorId;
    const jefe = await jefeDe(this.db, abogado);
    const destinatarios: (string | null)[] = [];
    if (reversion) {
      destinatarios.push(abogado, jefe, p.resueltaPorId, ...(await this.usuariosConPermiso(["provisiones.disponer_entregar"])));
    } else if (estado === "Solicitada" || estado === "Rendida") {
      destinatarios.push(...(await this.usuariosConPermiso(["provisiones.registrar_pago"])));
    } else if (estado === "EnAprobacion") {
      destinatarios.push(...(jefe ? [jefe] : await this.usuariosConPermiso(["provisiones.autorizar"])));
    } else if (estado === "Autorizada") {
      destinatarios.push(abogado, ...(await this.usuariosConPermiso(["provisiones.disponer_entregar"])));
    } else if (estado === "Pagada" || estado === "Disponible") {
      destinatarios.push(abogado, jefe);
    } else {
      destinatarios.push(abogado);
    }
    const titulo =
      estado === "Solicitada"
        ? `Provisión solicitada en ${a.correlativo}: registrar el pago del cliente`
        : estado === "EnAprobacion"
          ? `Entrega de provisión por autorizar: ${a.correlativo}`
          : `Provisión ${a.correlativo}: ${ESTADO_PROVISION_LABEL[estado]}`;
    await avisar(
      this.notif,
      destinatarios,
      {
        codPlan: a.codPlan,
        severidad: estado === "Disponible" || estado === "EnAprobacion" || reversion ? "warn" : "info",
        titulo,
        detalle: observacion ?? `${clp(p.monto)} — ${p.motivo}`,
        accionUrl: `/atenciones/${p.atencionId}`,
        metadata: { provisionId: p.id, estado },
      },
      actorId,
      {
        servicio: this.correos,
        atencionId: p.atencionId,
        plantilla: `provision.${reversion ? "Revertida" : estado}`,
        // Anexo §X: solicitud.fondos@ al solicitar; autoriza.provision@ al autorizar.
        casillas: estado === "Solicitada" ? ["solicitudFondos"] : estado === "Autorizada" && !reversion ? ["autorizaProvision"] : [],
      },
    );
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
      .select({ id: atenciones.id, estado: atenciones.estado, codPlan: atenciones.codPlan, correlativo: atenciones.correlativo })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!row) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return row;
  }
}

// Usado al terminar la atención: provisiones rendidas o reingresadas pasan a Cerrada (las
// rendidas al cliente ya están en su estado final).
export async function cerrarProvisionesDeAtencion(db: Database, atencionId: string, usuarioId: string | null): Promise<void> {
  const rendidas = await db
    .select({ id: provisiones.id, estado: provisiones.estado })
    .from(provisiones)
    .where(and(eq(provisiones.atencionId, atencionId), inArray(provisiones.estado, ["Rendida", "Reingresado"])));
  for (const p of rendidas) {
    await db.update(provisiones).set({ estado: "Cerrada" }).where(eq(provisiones.id, p.id));
    await db.insert(provisionesEventos).values({ provisionId: p.id, estadoDesde: p.estado, estadoHasta: "Cerrada", usuarioId, observacion: "Atención terminada" });
  }
}
