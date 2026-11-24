import { documentos } from "../../db/schema/documentos";
import { CorreosService } from "../correos/correos.service";
import type { CriteriosBusqueda } from "@legalmene/shared";
import { condicionAtencion } from "../../common/busqueda/criterios";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  ESTADO_ARANCEL_LABEL,
  ESTADOS_ARANCEL_BLOQUEANTES,
  ESTADOS_ARANCEL_PAGABLES_WEBPAY,
  TRANSICIONES_ARANCEL,
  type EstadoArancelAtencion,
  type EventoFinanciero,
  type PagoArancel,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { atenciones } from "../../db/schema/atenciones";
import { valoresUf } from "../../db/schema/aranceles";
import { arancelesAtencion, arancelesAtencionEventos, ArancelAtencionRow } from "../../db/schema/finanzas";
import { usuarios } from "../../db/schema/usuarios";
import { CoberturasService } from "./coberturas.service";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { avisar, equipoDeAtencion, usuariosConPermiso } from "../notif-inbox/destinatarios";
import { ufCentesimasAClp } from "./copago";
import { afiliados } from "../../db/schema/afiliados";
import type { Pago } from "../../db/schema/pagos";
import { crearOrdenWebPay } from "../pagos/orden-webpay";
import { hoyChileISO } from "../../common/utils/dias-habiles";
import { plantillaPagoWebPay } from "../correos/plantillas";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const fechaCl = (iso: string) => iso.split("-").reverse().join("/");

// Arancel (copago) por atención, Anexo §IX: Requerido → EnAprobacion → Aprobado → Pagado.
@Injectable()
export class ArancelesAtencionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CoberturasService) private readonly coberturas: CoberturasService,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
    @Optional() @Inject(CorreosService) private readonly correos?: CorreosService,
  ) {}

  private async snapshot(atencionId: string) {
    const c = await this.coberturas.copagoAtencion(atencionId);
    return {
      arancelId: c.arancel?.id ?? null,
      coberturaModalidad: c.cobertura?.modalidad ?? c.modalidad,
      coberturaPorcentaje: c.cobertura?.porcentaje ?? null,
      copagoUfCentesimas: c.copagoUfCentesimas,
      estado: (c.requiereCopago ? "Requerido" : "NoRequerido") as EstadoArancelAtencion,
    };
  }

  // Se llama al crear una asesoría/juicio: el copago define si queda detenida.
  async crearParaAtencion(atencionId: string, usuarioId: string | null): Promise<ArancelAtencionRow> {
    const datos = await this.snapshot(atencionId);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(arancelesAtencion)
        .values({ atencionId, ...datos })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [actual] = await tx.select().from(arancelesAtencion).where(eq(arancelesAtencion.atencionId, atencionId));
        return actual;
      }
      await this.evento(tx, row.id, null, row.estado, usuarioId, null);
      return row;
    });
  }

  // Las consultas no tienen arancel. Las asesorías/juicios sin fila (p. ej. creadas antes de
  // que existiera la tabla en un ambiente sin migrar datos) la crean al leerla.
  async obtener(atencionId: string): Promise<ArancelAtencionRow | null> {
    const [a] = await this.db
      .select({ tipo: atenciones.tipo })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
    if (a.tipo === "Consulta") return null;
    const [row] = await this.db.select().from(arancelesAtencion).where(eq(arancelesAtencion.atencionId, atencionId));
    return row ?? this.crearParaAtencion(atencionId, null);
  }

  // Si cambia la materia antes de enviar el arancel a aprobación, se recalcula el copago.
  async recalcular(atencionId: string, usuarioId: string | null): Promise<void> {
    const actual = await this.obtener(atencionId);
    if (!actual || !["NoRequerido", "Requerido"].includes(actual.estado)) return;
    const datos = await this.snapshot(atencionId);
    await this.db.transaction(async (tx) => {
      await tx.update(arancelesAtencion).set({ ...datos, updatedAt: new Date() }).where(eq(arancelesAtencion.id, actual.id));
      if (datos.estado !== actual.estado) await this.evento(tx, actual.id, actual.estado, datos.estado, usuarioId, "Recalculado por cambio de materia");
    });
  }

  // Motivo de retención de la atención, o null si el arancel no la detiene.
  async bloqueo(atencionId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ estado: arancelesAtencion.estado })
      .from(arancelesAtencion)
      .where(eq(arancelesAtencion.atencionId, atencionId));
    if (!row || !ESTADOS_ARANCEL_BLOQUEANTES.includes(row.estado)) return null;
    return `pago del arancel (estado: ${ESTADO_ARANCEL_LABEL[row.estado]})`;
  }

  private async transicionar(
    atencionId: string,
    hasta: EstadoArancelAtencion,
    usuarioId: string,
    extra: Partial<typeof arancelesAtencion.$inferInsert> = {},
    observacion: string | null = null,
    eventoEstado: EstadoArancelAtencion = hasta,
  ): Promise<ArancelAtencionRow> {
    const actual = await this.obtener(atencionId);
    if (!actual) throw new BadRequestException("Las consultas no tienen arancel");
    if (!TRANSICIONES_ARANCEL[actual.estado].includes(hasta)) {
      throw new ConflictException(
        `El arancel está ${ESTADO_ARANCEL_LABEL[actual.estado].toLowerCase()}; no puede pasar a ${ESTADO_ARANCEL_LABEL[hasta].toLowerCase()}`,
      );
    }
    return this.db.transaction(async (tx) => {
      // Solo desde el estado leído: si otro usuario lo cambió entretanto, 409 (sin doble pago).
      const [row] = await tx
        .update(arancelesAtencion)
        .set({ ...extra, estado: hasta, updatedAt: new Date() })
        .where(and(eq(arancelesAtencion.id, actual.id), eq(arancelesAtencion.estado, actual.estado)))
        .returning();
      if (!row) throw new ConflictException("El arancel cambió mientras se procesaba; actualice y reintente");
      await this.evento(tx, actual.id, actual.estado, eventoEstado, usuarioId, observacion);
      return row;
    });
  }

  async enviarAprobacion(atencionId: string, usuarioId: string) {
    const row = await this.transicionar(atencionId, "EnAprobacion", usuarioId, { caminoPago: "Aprobacion" });
    await this.avisar(atencionId, "EnAprobacion", usuarioId);
    return row;
  }

  // Avisos del flujo de arancel (Anexo §IX): a la jefatura al enviarlo, al abogado al rechazarlo,
  // a Finanzas al aprobarlo y al abogado y su jefatura al registrar el pago.
  private async avisar(atencionId: string, etapa: "EnAprobacion" | "Rechazado" | "Aprobado" | "Pagado", actorId: string, detalle?: string) {
    const equipo = await equipoDeAtencion(this.db, atencionId);
    if (!equipo) return;
    const base = { codPlan: equipo.codPlan, accionUrl: `/atenciones/${atencionId}`, metadata: { atencionId, arancel: etapa } };
    const correo = { servicio: this.correos, atencionId, plantilla: `arancel.${etapa}` };
    if (etapa === "EnAprobacion") {
      const aprobadores = equipo.jefeId ? [equipo.jefeId] : await usuariosConPermiso(this.db, ["aranceles_atencion.aprobar"]);
      // Anexo §IX: correo a la jefatura y a aprueba.arancel@ con RUT, tipo y correlativo.
      await avisar(
        this.notif,
        aprobadores,
        { ...base, severidad: "warn", titulo: `Arancel por aprobar: ${equipo.correlativo}`, detalle: `${equipo.tipo} · RUT ${equipo.afiliadoRut ?? "—"}` },
        actorId,
        { ...correo, casillas: ["apruebaArancel"] },
      );
    } else if (etapa === "Rechazado") {
      await avisar(this.notif, [equipo.abogadoId], { ...base, severidad: "warn", titulo: `Arancel rechazado: ${equipo.correlativo}`, detalle }, actorId, correo);
    } else if (etapa === "Aprobado") {
      const finanzas = await usuariosConPermiso(this.db, ["aranceles_atencion.registrar_pago"]);
      await avisar(this.notif, [...finanzas, equipo.abogadoId], { ...base, titulo: `Arancel aprobado, pendiente de pago: ${equipo.correlativo}` }, actorId, correo);
    } else {
      await avisar(this.notif, [equipo.abogadoId, equipo.jefeId], { ...base, titulo: `Arancel pagado: ${equipo.correlativo}`, detalle }, actorId, correo);
    }
  }

  // Cuatro ojos: quien envió el arancel a aprobación no lo aprueba ni lo rechaza.
  private async asegurarOtroAprobador(atencionId: string, usuarioId: string): Promise<void> {
    const actual = await this.obtener(atencionId);
    if (!actual) return;
    const [envio] = await this.db
      .select({ usuarioId: arancelesAtencionEventos.usuarioId })
      .from(arancelesAtencionEventos)
      .where(and(eq(arancelesAtencionEventos.arancelAtencionId, actual.id), eq(arancelesAtencionEventos.estadoHasta, "EnAprobacion")))
      .orderBy(desc(arancelesAtencionEventos.fecha))
      .limit(1);
    if (envio?.usuarioId === usuarioId) {
      throw new ForbiddenException("Quien envió el arancel a aprobación no puede resolverlo");
    }
  }

  async aprobar(atencionId: string, usuarioId: string, observacion?: string) {
    await this.asegurarOtroAprobador(atencionId, usuarioId);
    const row = await this.transicionar(atencionId, "Aprobado", usuarioId, { motivoRechazo: null }, observacion ?? null);
    await this.avisar(atencionId, "Aprobado", usuarioId);
    return row;
  }

  // El rechazo devuelve el arancel a Requerido (rojo) con el motivo para corregirlo.
  async rechazar(atencionId: string, usuarioId: string, motivo: string) {
    await this.asegurarOtroAprobador(atencionId, usuarioId);
    const row = await this.transicionar(atencionId, "Requerido", usuarioId, { motivoRechazo: motivo }, motivo, "Rechazado");
    await this.avisar(atencionId, "Rechazado", usuarioId, motivo);
    return row;
  }

  // El monto en pesos se calcula con la UF del día del pago (Anexo §IX 5.4).
  async registrarPago(atencionId: string, usuarioId: string, input: PagoArancel) {
    const actual = await this.obtener(atencionId);
    if (!actual) throw new BadRequestException("Las consultas no tienen arancel");
    const [uf] = await this.db.select().from(valoresUf).where(eq(valoresUf.fecha, input.fechaPago));
    if (!uf) {
      throw new BadRequestException(`No hay valor UF cargado para el ${fechaCl(input.fechaPago)}; cárguelo antes de registrar el pago`);
    }
    if (input.comprobanteDocumentoId) {
      const [doc] = await this.db
        .select({ id: documentos.id })
        .from(documentos)
        .where(and(eq(documentos.id, input.comprobanteDocumentoId), eq(documentos.atencionId, atencionId)));
      if (!doc) throw new BadRequestException("El comprobante no corresponde a un documento de esta atención");
    }
    const montoClp = ufCentesimasAClp(actual.copagoUfCentesimas ?? 0, uf.valorCentavos);
    const row = await this.transicionar(atencionId, "Pagado", usuarioId, {
      fechaPago: input.fechaPago,
      medioPago: input.medio,
      cuotasPago: input.cuotas ?? null,
      referenciaPago: input.referencia || null,
      ufValorCentavos: uf.valorCentavos,
      montoClp,
      comprobanteDocumentoId: input.comprobanteDocumentoId ?? null,
      registradoPorId: usuarioId,
    });
    await this.avisar(atencionId, "Pagado", usuarioId, `${(montoClp ?? 0).toLocaleString("es-CL")} pesos (${input.medio})`);
    return row;
  }

  // "Notificar Pago" (Anexo §IX 3.ii): orden WebPay por el copago en pesos con la UF de hoy y correo al
  // cliente con el enlace. Se puede elegir en cualquier estado salvo Pagado (o sin copago).
  async notificarPago(atencionId: string, usuarioId: string) {
    const actual = await this.obtener(atencionId);
    if (!actual) throw new BadRequestException("Las consultas no tienen arancel");
    if (!ESTADOS_ARANCEL_PAGABLES_WEBPAY.includes(actual.estado)) {
      throw new ConflictException(`El arancel está ${ESTADO_ARANCEL_LABEL[actual.estado].toLowerCase()}: no hay pago que notificar`);
    }
    const hoy = hoyChileISO();
    const [uf] = await this.db.select().from(valoresUf).where(eq(valoresUf.fecha, hoy));
    if (!uf) throw new BadRequestException(`No hay valor UF cargado para hoy (${fechaCl(hoy)}); cárguelo antes de notificar el pago`);
    const [d] = await this.db
      .select({ codPlan: atenciones.codPlan, afiliadoId: atenciones.afiliadoId, correlativo: atenciones.correlativo, email: afiliados.email, nombre: afiliados.nombres })
      .from(atenciones)
      .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
      .where(eq(atenciones.id, atencionId));
    if (!d.email) throw new BadRequestException("El afiliado no tiene correo registrado; agréguelo en su ficha");
    if (!this.correos) throw new BadRequestException("El envío de correos no está disponible");
    const montoClp = ufCentesimasAClp(actual.copagoUfCentesimas ?? 0, uf.valorCentavos) ?? 0;
    if (montoClp <= 0) throw new BadRequestException("El copago de esta atención es cero");
    const { pago, redirectUrl } = await this.db.transaction(async (tx) => {
      const orden = await crearOrdenWebPay(tx, {
        codPlan: d.codPlan,
        afiliadoId: d.afiliadoId,
        atencionId,
        monto: montoClp,
        returnUrl: this.correos!.url("/pago"),
        metadata: { arancelAtencionId: actual.id, ufValorCentavos: uf.valorCentavos },
      });
      const [row] = await tx
        .update(arancelesAtencion)
        .set({ caminoPago: "WebPay", webpayOrdenCompra: orden.pago.ordenCompra, updatedAt: new Date() })
        .where(and(eq(arancelesAtencion.id, actual.id), eq(arancelesAtencion.estado, actual.estado)))
        .returning();
      if (!row) throw new ConflictException("El arancel cambió mientras se procesaba; actualice y reintente");
      await this.evento(tx, actual.id, actual.estado, actual.estado, usuarioId, `Pago notificado al cliente por WebPay (orden ${orden.pago.ordenCompra})`);
      return orden;
    });
    const estado = await this.correos.enviar(
      [d.email],
      plantillaPagoWebPay({ cliente: d.nombre, correlativo: d.correlativo, montoClp, url: redirectUrl }),
      { plantilla: "cliente.pago_webpay", atencionId, enviadoPorId: usuarioId },
    );
    return { ordenCompra: pago.ordenCompra, montoClp, estado, para: d.email };
  }

  // Pago WebPay confirmado de una orden de arancel: queda Pagado desde cualquier estado pendiente,
  // sin registro manual, y se avisa al abogado y su jefatura (Anexo §IX 4.1, l.1451).
  async pagoWebPay(pago: Pago) {
    const arancelId = pago.metadata?.arancelAtencionId as string | undefined;
    if (!arancelId) return null;
    const [actual] = await this.db.select().from(arancelesAtencion).where(eq(arancelesAtencion.id, arancelId));
    if (!actual || actual.atencionId !== pago.atencionId) return null;
    const ufValor = typeof pago.metadata?.ufValorCentavos === "number" ? (pago.metadata.ufValorCentavos as number) : null;
    const row = await this.db.transaction(async (tx) => {
      const [r] = await tx
        .update(arancelesAtencion)
        .set({
          estado: "Pagado",
          caminoPago: "WebPay",
          fechaPago: hoyChileISO(pago.fechaResolucion ?? new Date()),
          medioPago: "WebPay",
          referenciaPago: pago.ordenCompra,
          ufValorCentavos: ufValor,
          montoClp: pago.monto,
          registradoPorId: null,
          updatedAt: new Date(),
        })
        .where(and(eq(arancelesAtencion.id, arancelId), inArray(arancelesAtencion.estado, [...ESTADOS_ARANCEL_PAGABLES_WEBPAY])))
        .returning();
      if (r) await this.evento(tx, arancelId, actual.estado, "Pagado", null, `Pagado por WebPay (orden ${pago.ordenCompra})`);
      return r;
    });
    if (!row) {
      // Ya estaba pagado (p. ej. también en casa central): Finanzas debe revisar la devolución.
      const finanzas = await usuariosConPermiso(this.db, ["aranceles_atencion.registrar_pago"]);
      await avisar(
        this.notif,
        finanzas,
        { codPlan: pago.codPlan, severidad: "critical", titulo: `Pago WebPay sobre un arancel ya resuelto (${pago.ordenCompra})`, detalle: `Estado: ${ESTADO_ARANCEL_LABEL[actual.estado]}`, accionUrl: `/atenciones/${actual.atencionId}` },
        null,
      );
      return null;
    }
    await this.avisar(actual.atencionId, "Pagado", "", `${pago.monto.toLocaleString("es-CL")} pesos (WebPay)`);
    return row;
  }

  async listar(f: CriteriosBusqueda & { estado?: EstadoArancelAtencion } = {}) {
    const q = this.db
      .select({
        arancel: arancelesAtencion,
        correlativo: atenciones.correlativo,
        asunto: atenciones.asunto,
        tipo: atenciones.tipo,
        codPlan: atenciones.codPlan,
      })
      .from(arancelesAtencion)
      .innerJoin(atenciones, eq(atenciones.id, arancelesAtencion.atencionId))
      .orderBy(desc(arancelesAtencion.updatedAt))
      .limit(200);
    const rows = await q.where(
      and(filtroAtenciones(), condicionAtencion(f), f.estado ? eq(arancelesAtencion.estado, f.estado) : undefined),
    );
    return rows.map((r) => ({ ...r.arancel, correlativo: r.correlativo, asunto: r.asunto, tipo: r.tipo, codPlan: r.codPlan }));
  }

  async eventos(atencionId: string): Promise<EventoFinanciero[]> {
    const actual = await this.obtener(atencionId);
    if (!actual) return [];
    const rows = await this.db
      .select({
        id: arancelesAtencionEventos.id,
        estadoDesde: arancelesAtencionEventos.estadoDesde,
        estadoHasta: arancelesAtencionEventos.estadoHasta,
        usuarioEmail: usuarios.email,
        observacion: arancelesAtencionEventos.observacion,
        fecha: arancelesAtencionEventos.fecha,
      })
      .from(arancelesAtencionEventos)
      .leftJoin(usuarios, eq(usuarios.id, arancelesAtencionEventos.usuarioId))
      .where(eq(arancelesAtencionEventos.arancelAtencionId, actual.id))
      .orderBy(asc(arancelesAtencionEventos.fecha));
    return rows as unknown as EventoFinanciero[];
  }

  private async evento(
    tx: Tx,
    arancelAtencionId: string,
    desde: EstadoArancelAtencion | null,
    hasta: EstadoArancelAtencion,
    usuarioId: string | null,
    observacion: string | null,
  ) {
    await tx.insert(arancelesAtencionEventos).values({ arancelAtencionId, estadoDesde: desde, estadoHasta: hasta, usuarioId, observacion });
  }
}
