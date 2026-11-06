import type { CriteriosBusqueda } from "@legalmene/shared";
import { condicionAtencion } from "../../common/busqueda/criterios";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ESTADO_ARANCEL_LABEL,
  ESTADOS_ARANCEL_BLOQUEANTES,
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
import { ufCentesimasAClp } from "./copago";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const fechaCl = (iso: string) => iso.split("-").reverse().join("/");

// Arancel (copago) por atención, Anexo §IX: Requerido → EnAprobacion → Aprobado → Pagado.
@Injectable()
export class ArancelesAtencionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CoberturasService) private readonly coberturas: CoberturasService,
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

  enviarAprobacion(atencionId: string, usuarioId: string) {
    return this.transicionar(atencionId, "EnAprobacion", usuarioId);
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
    return this.transicionar(atencionId, "Aprobado", usuarioId, { motivoRechazo: null }, observacion ?? null);
  }

  // El rechazo devuelve el arancel a Requerido (rojo) con el motivo para corregirlo.
  async rechazar(atencionId: string, usuarioId: string, motivo: string) {
    await this.asegurarOtroAprobador(atencionId, usuarioId);
    return this.transicionar(atencionId, "Requerido", usuarioId, { motivoRechazo: motivo }, motivo, "Rechazado");
  }

  // El monto en pesos se calcula con la UF del día del pago (Anexo §IX 5.4).
  async registrarPago(atencionId: string, usuarioId: string, input: PagoArancel) {
    const actual = await this.obtener(atencionId);
    if (!actual) throw new BadRequestException("Las consultas no tienen arancel");
    const [uf] = await this.db.select().from(valoresUf).where(eq(valoresUf.fecha, input.fechaPago));
    if (!uf) {
      throw new BadRequestException(`No hay valor UF cargado para el ${fechaCl(input.fechaPago)}; cárguelo antes de registrar el pago`);
    }
    const montoClp = ufCentesimasAClp(actual.copagoUfCentesimas ?? 0, uf.valorCentavos);
    return this.transicionar(atencionId, "Pagado", usuarioId, {
      fechaPago: input.fechaPago,
      medioPago: input.medio,
      ufValorCentavos: uf.valorCentavos,
      montoClp,
      comprobanteDocumentoId: input.comprobanteDocumentoId ?? null,
      registradoPorId: usuarioId,
    });
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
