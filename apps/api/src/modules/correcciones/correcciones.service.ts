import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import {
  RETROCESO_ARANCEL,
  RETROCESO_PROVISION,
  type EstadoAtencion,
  type PanoramaCorreccion,
  type TipoAtencion,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones, derivaciones } from "../../db/schema/atenciones";
import { arancelesAtencion, arancelesAtencionEventos } from "../../db/schema/finanzas";
import { provisionMovimientos, provisiones, provisionesEventos } from "../../db/schema/provisiones";
import { gestiones } from "../../db/schema/gestiones";

// Estado al que vuelve una atención reabierta: la etapa de trabajo de cada tipo.
const REAPERTURA: Record<TipoAtencion, EstadoAtencion> = {
  Consulta: "Iniciada",
  Asesoria: "Pendiente",
  Juicio: "Pendiente",
  PosesionEfectiva: "Ingresada",
};
const CERRADAS: EstadoAtencion[] = ["Terminada", "Abandonada"];

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Herramientas del administrador para corregir registros y retroceder flujos (Anexo §II l.156).
// Es la única vía que escribe estados fuera de los flujos normales: cada corrección exige un
// motivo, deja su rastro en la bitácora del flujo (eventos o metadata.correcciones de la
// atención) y la registra AuditInterceptor. Las escrituras son condicionales al estado leído.
@Injectable()
export class CorreccionesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async panorama(correlativo: string): Promise<PanoramaCorreccion> {
    const [a] = await this.db
      .select({ id: atenciones.id, correlativo: atenciones.correlativo, tipo: atenciones.tipo, estado: atenciones.estado, asunto: atenciones.asunto })
      .from(atenciones)
      .where(eq(atenciones.correlativo, correlativo.trim().toUpperCase()));
    if (!a) throw new NotFoundException(`No existe la atención ${correlativo}`);
    const [ar] = await this.db.select({ estado: arancelesAtencion.estado }).from(arancelesAtencion).where(eq(arancelesAtencion.atencionId, a.id));
    const provs = await this.db
      .select({ id: provisiones.id, monto: provisiones.monto, motivo: provisiones.motivo, estado: provisiones.estado })
      .from(provisiones)
      .where(eq(provisiones.atencionId, a.id));
    const derivs = await this.db
      .select({ id: derivaciones.id, nuevoTipo: derivaciones.nuevoTipo, estado: derivaciones.estado, derivadaId: derivaciones.atencionDerivadaId })
      .from(derivaciones)
      .where(eq(derivaciones.consultaId, a.id));
    const derivadas = derivs.filter((d) => d.derivadaId).map((d) => d.derivadaId!);
    const correlativos = derivadas.length
      ? await this.db.select({ id: atenciones.id, correlativo: atenciones.correlativo }).from(atenciones).where(inArray(atenciones.id, derivadas))
      : [];
    return {
      atencion: a,
      reabrible: CERRADAS.includes(a.estado),
      arancel: ar ? { estado: ar.estado, retrocedeA: RETROCESO_ARANCEL[ar.estado] ?? null } : null,
      provisiones: provs.map((p) => ({ ...p, retrocedeA: RETROCESO_PROVISION[p.estado] ?? null })),
      derivaciones: derivs.map((d) => ({
        id: d.id,
        nuevoTipo: d.nuevoTipo,
        estado: d.estado,
        atencionDerivadaCorrelativo: correlativos.find((c) => c.id === d.derivadaId)?.correlativo ?? null,
        reiniciable: d.estado !== "Solicitada",
      })),
    };
  }

  // Deja constancia en metadata.correcciones de la atención (además de la auditoría).
  private async anotar(tx: Tx | Database, atencionId: string, accion: string, motivo: string, actorId: string) {
    const entrada = JSON.stringify([{ fecha: new Date().toISOString(), porId: actorId, accion, motivo }]);
    await tx
      .update(atenciones)
      .set({
        metadata: sql`jsonb_set(coalesce(${atenciones.metadata}, '{}'::jsonb), '{correcciones}', coalesce(${atenciones.metadata}->'correcciones', '[]'::jsonb) || ${entrada}::jsonb)`,
        updatedAt: new Date(),
      })
      .where(eq(atenciones.id, atencionId));
  }

  // Reabre una atención terminada o abandonada: vuelve a su etapa de trabajo, sin causa ni fecha
  // de término ni solicitud de V°B° pendiente.
  async reabrirAtencion(id: string, motivo: string, actorId: string) {
    const [a] = await this.db.select({ tipo: atenciones.tipo, estado: atenciones.estado }).from(atenciones).where(eq(atenciones.id, id));
    if (!a) throw new NotFoundException(`Atención ${id} no existe`);
    if (!CERRADAS.includes(a.estado)) throw new BadRequestException("Solo se reabren atenciones terminadas o abandonadas");
    const destino = REAPERTURA[a.tipo];
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(atenciones)
        .set({ estado: destino, fechaCierre: null, causaTerminoId: null, solicitudTermino: null, updatedAt: new Date() })
        .where(and(eq(atenciones.id, id), eq(atenciones.estado, a.estado)))
        .returning({ id: atenciones.id, estado: atenciones.estado });
      if (!row) throw new ConflictException("La atención cambió mientras se procesaba");
      await this.anotar(tx, id, `Reabierta (${a.estado} → ${destino})`, motivo, actorId);
      return row;
    });
  }

  // Reinicia una derivación: la rechazada vuelve a "Solicitada"; la aprobada también, siempre que
  // la atención derivada no tenga trabajo (gestiones completadas, arancel pagado ni provisiones):
  // esa atención queda abandonada y la consulta vuelve a "Respondida".
  async reiniciarDerivacion(id: string, motivo: string, actorId: string) {
    const [d] = await this.db.select().from(derivaciones).where(eq(derivaciones.id, id));
    if (!d) throw new NotFoundException(`Derivación ${id} no existe`);
    if (d.estado === "Solicitada") throw new BadRequestException("La derivación ya está pendiente de resolución");
    return this.db.transaction(async (tx) => {
      if (d.estado === "Aprobada" && d.atencionDerivadaId) {
        const derivada = d.atencionDerivadaId;
        const [g] = await tx.select({ n: count() }).from(gestiones).where(and(eq(gestiones.atencionId, derivada), eq(gestiones.estado, "Completada")));
        const [p] = await tx.select({ n: count() }).from(provisiones).where(eq(provisiones.atencionId, derivada));
        const [ar] = await tx.select({ estado: arancelesAtencion.estado }).from(arancelesAtencion).where(eq(arancelesAtencion.atencionId, derivada));
        if (Number(g?.n ?? 0) > 0 || Number(p?.n ?? 0) > 0 || ar?.estado === "Pagado") {
          throw new ConflictException("La atención derivada ya tiene trabajo (gestiones, provisiones o arancel pagado); corríjala directamente");
        }
        await tx.update(atenciones).set({ estado: "Abandonada", fechaCierre: new Date(), updatedAt: new Date() }).where(eq(atenciones.id, derivada));
        await this.anotar(tx, derivada, "Abandonada al reiniciar la derivación que la originó", motivo, actorId);
        await tx
          .update(atenciones)
          .set({ estado: "Respondida", fechaCierre: null, updatedAt: new Date() })
          .where(and(eq(atenciones.id, d.consultaId), eq(atenciones.estado, "Derivada")));
      }
      const [row] = await tx
        .update(derivaciones)
        .set({ estado: "Solicitada", resueltaPorId: null, resueltaAt: null, observacion: null, atencionDerivadaId: null })
        .where(and(eq(derivaciones.id, id), eq(derivaciones.estado, d.estado)))
        .returning();
      if (!row) throw new ConflictException("La derivación cambió mientras se procesaba");
      await this.anotar(tx, d.consultaId, `Derivación reiniciada (${d.estado} → Solicitada)`, motivo, actorId);
      return row;
    });
  }

  // Un paso atrás en el arancel de la atención. Al volver de Pagado se anulan los datos del pago.
  async retrocederArancel(atencionId: string, motivo: string, actorId: string) {
    const [ar] = await this.db.select().from(arancelesAtencion).where(eq(arancelesAtencion.atencionId, atencionId));
    if (!ar) throw new NotFoundException("La atención no tiene arancel");
    const destino = RETROCESO_ARANCEL[ar.estado] as typeof ar.estado | undefined;
    if (!destino) throw new BadRequestException(`Un arancel ${ar.estado} no se puede retroceder`);
    const limpiar =
      ar.estado === "Pagado"
        ? { fechaPago: null, medioPago: null, cuotasPago: null, referenciaPago: null, ufValorCentavos: null, montoClp: null, comprobanteDocumentoId: null, registradoPorId: null }
        : {};
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(arancelesAtencion)
        .set({ ...limpiar, estado: destino, updatedAt: new Date() })
        .where(and(eq(arancelesAtencion.id, ar.id), eq(arancelesAtencion.estado, ar.estado)))
        .returning();
      if (!row) throw new ConflictException("El arancel cambió mientras se procesaba");
      await tx.insert(arancelesAtencionEventos).values({ arancelAtencionId: ar.id, estadoDesde: ar.estado, estadoHasta: destino, usuarioId: actorId, observacion: `Corrección: ${motivo}` });
      await this.anotar(tx, atencionId, `Arancel retrocedido (${ar.estado} → ${destino})`, motivo, actorId);
      return row;
    });
  }

  // Un paso atrás en una provisión, anulando los datos de la etapa deshecha. No retrocede una
  // entrega con gastos registrados.
  async retrocederProvision(id: string, motivo: string, actorId: string) {
    const [p] = await this.db.select().from(provisiones).where(eq(provisiones.id, id));
    if (!p) throw new NotFoundException(`Provisión ${id} no existe`);
    const destino = RETROCESO_PROVISION[p.estado] as typeof p.estado | undefined;
    if (!destino) throw new BadRequestException(`Una provisión ${p.estado} no se puede retroceder`);
    const limpiar: Partial<typeof provisiones.$inferInsert> =
      p.estado === "Pagada"
        ? { medioPagoCliente: null, fechaPagoCliente: null, cuotasPagoCliente: null, referenciaPagoCliente: null }
        : p.estado === "Autorizada"
          ? { resueltaPorId: null, observacionResolucion: null, fechaResolucion: null }
          : p.estado === "Disponible"
            ? { fechaDisponible: null }
            : p.estado === "Entregada"
              ? { montoEntregado: null, fechaEntrega: null }
              : p.estado === "Rendida"
                ? { fechaRendicion: null }
                : {};
    return this.db.transaction(async (tx) => {
      if (p.estado === "Entregada") {
        const [m] = await tx.select({ n: count() }).from(provisionMovimientos).where(eq(provisionMovimientos.provisionId, id));
        if (Number(m?.n ?? 0) > 0) throw new ConflictException("La entrega ya tiene gastos registrados; no se puede deshacer");
      }
      const [row] = await tx
        .update(provisiones)
        .set({ ...limpiar, estado: destino })
        .where(and(eq(provisiones.id, id), eq(provisiones.estado, p.estado)))
        .returning();
      if (!row) throw new ConflictException("La provisión cambió mientras se procesaba");
      await tx.insert(provisionesEventos).values({ provisionId: id, estadoDesde: p.estado, estadoHasta: destino, usuarioId: actorId, observacion: `Corrección: ${motivo}` });
      await this.anotar(tx, p.atencionId, `Provisión retrocedida (${p.estado} → ${destino})`, motivo, actorId);
      return row;
    });
  }
}
