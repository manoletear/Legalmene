import { tiposGestion } from "../../db/schema/maestros";
import { plantillaGestionCliente } from "../correos/plantillas";
import { CorreosService } from "../correos/correos.service";
import { avisar, equipoDeAtencion } from "../notif-inbox/destinatarios";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { and, count, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { gestiones, NuevaGestion, Gestion } from "../../db/schema/gestiones";
import { atenciones } from "../../db/schema/atenciones";
import { usuarios } from "../../db/schema/usuarios";
import { arancelesAtencion } from "../../db/schema/finanzas";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import {
  ESTADOS_ARANCEL_BLOQUEANTES,
  ESTADO_ARANCEL_LABEL,
  ESTADOS_GESTION_ABIERTA,
  type CreateGestion,
  type CompletarGestion,
  type TipoGestion,
} from "@legalmene/shared";

// Gestiones de contacto con el cliente: cuentan como primer contacto y se permiten con el arancel impago.
const TIPOS_GESTION_CONTACTO: readonly TipoGestion[] = ["LlamadaTelefonica", "Email", "Reunion"];

export interface FiltroGestiones {
  page?: number;
  pageSize?: number;
  estado?: "Pendiente" | "Completada" | "Vencida" | "Cancelada";
  tipo?: string;
  responsableId?: string;
  soloVencidas?: boolean;
  codPlan?: string;
}

@Injectable()
export class GestionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
    @Optional() @Inject(CorreosService) private readonly correos?: CorreosService,
  ) {}

  async listarPorAtencion(atencionId: string): Promise<Gestion[]> {
    await this.planDeAtencion(atencionId);
    return this.db
      .select()
      .from(gestiones)
      .where(eq(gestiones.atencionId, atencionId))
      .orderBy(desc(gestiones.createdAt));
  }

  // Listado global, opcionalmente filtrado por el plan de la atención.
  async listarGlobal(filtro: FiltroGestiones) {
    const ahora = new Date();
    const page = filtro.page ?? 1;
    const pageSize = Math.min(filtro.pageSize ?? 50, 200);
    const where = and(
      filtroAtenciones(),
      filtro.codPlan ? eq(atenciones.codPlan, filtro.codPlan) : undefined,
      filtro.estado ? eq(gestiones.estado, filtro.estado) : undefined,
      filtro.tipo ? eq(gestiones.tipo, filtro.tipo as "Reunion") : undefined,
      filtro.responsableId ? eq(gestiones.responsableId, filtro.responsableId) : undefined,
      filtro.soloVencidas
        ? and(
            eq(gestiones.estado, "Pendiente"),
            isNotNull(gestiones.fechaCompromiso),
            lt(gestiones.fechaCompromiso, ahora),
          )
        : undefined,
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: gestiones.id,
          atencionId: gestiones.atencionId,
          tipo: gestiones.tipo,
          estado: gestiones.estado,
          titulo: gestiones.titulo,
          detalle: gestiones.detalle,
          responsableId: gestiones.responsableId,
          responsableEmail: usuarios.email,
          fechaCompromiso: gestiones.fechaCompromiso,
          fechaEjecucion: gestiones.fechaEjecucion,
          createdAt: gestiones.createdAt,
          correlativo: atenciones.correlativo,
          atencionAsunto: atenciones.asunto,
        })
        .from(gestiones)
        .innerJoin(atenciones, eq(gestiones.atencionId, atenciones.id))
        .innerJoin(usuarios, eq(gestiones.responsableId, usuarios.id))
        .where(where)
        .orderBy(desc(gestiones.fechaCompromiso), desc(gestiones.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(gestiones)
        .innerJoin(atenciones, eq(gestiones.atencionId, atenciones.id))
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

  async crear(input: CreateGestion): Promise<Gestion> {
    const codPlan = await this.planDeAtencion(input.atencionId);
    // Con un tipo del maestro, la categoría del sistema sale de él (no la elige el cliente).
    if (input.tipoGestionId) {
      const [tg] = await this.db.select().from(tiposGestion).where(eq(tiposGestion.id, input.tipoGestionId));
      if (!tg) throw new BadRequestException("El tipo de gestión no existe");
      input = { ...input, tipo: tg.categoria as CreateGestion["tipo"] };
    }
    await this.asegurarArancelRegularizado(input.atencionId, input.tipo);
    const [resp] = await this.db
      .select({ activo: usuarios.activo, bloqueado: usuarios.bloqueado })
      .from(usuarios)
      .where(eq(usuarios.id, input.responsableId));
    if (!resp) throw new BadRequestException("El responsable no existe");
    if (!resp.activo || resp.bloqueado) throw new BadRequestException("El responsable no está activo");
    if (input.fechaProgramada && input.fechaCompromiso && new Date(input.fechaCompromiso) < new Date(input.fechaProgramada)) {
      throw new BadRequestException("La fecha de compromiso no puede ser anterior a la de inicio");
    }
    const payload: NuevaGestion = {
      atencionId: input.atencionId,
      tipo: input.tipo,
      tipoGestionId: input.tipoGestionId ?? null,
      estado: input.estado ?? "Pendiente",
      titulo: input.titulo,
      detalle: input.detalle ?? null,
      responsableId: input.responsableId,
      fechaProgramada: input.fechaProgramada ? new Date(input.fechaProgramada) : null,
      fechaCompromiso: input.fechaCompromiso ? new Date(input.fechaCompromiso) : null,
      documentosIds: input.documentosIds ?? [],
      informarCliente: input.informarCliente ?? false,
    };
    const [row] = await this.db.insert(gestiones).values(payload).returning();
    await this.db
      .update(atenciones)
      .set({ fechaUltimaGestion: new Date(), updatedAt: new Date() })
      .where(eq(atenciones.id, input.atencionId));
    // Registrar una gestión inicia el trabajo de un caso Pendiente; en otros estados
    // (espera de arancel, comité, etc.) el estado no cambia.
    await this.db
      .update(atenciones)
      .set({ estado: "EnGestion" })
      .where(and(eq(atenciones.id, input.atencionId), eq(atenciones.estado, "Pendiente")));
    await this.notif.crear({
      codPlan,
      usuarioId: row.responsableId,
      severidad: row.fechaCompromiso ? "warn" : "info",
      titulo: `Gestión asignada: ${row.titulo}`,
      detalle: row.fechaCompromiso
        ? `${row.tipo} · compromiso ${row.fechaCompromiso.toISOString().slice(0, 10)}`
        : row.tipo,
      accionUrl: `/atenciones/${input.atencionId}`,
      metadata: { gestionId: row.id, atencionId: input.atencionId },
    });
    if (row.informarCliente) await this.informarCliente(row, "inicio");
    return row;
  }

  // Correo al cliente con el inicio o el término de una gestión marcada para informarle.
  private async informarCliente(g: { atencionId: string; titulo: string; fechaProgramada: Date | null; fechaEjecucion: Date | null; resultado: string | null }, etapa: "inicio" | "termino") {
    if (!this.correos) return;
    const equipo = await equipoDeAtencion(this.db, g.atencionId);
    if (!equipo?.afiliadoEmail) return;
    const cuando = etapa === "inicio" ? (g.fechaProgramada ?? new Date()) : (g.fechaEjecucion ?? new Date());
    await this.correos.enviar(
      [equipo.afiliadoEmail],
      plantillaGestionCliente({
        cliente: equipo.afiliadoNombre ?? "cliente",
        correlativo: equipo.correlativo,
        gestion: g.titulo,
        etapa,
        fecha: cuando.toLocaleDateString("es-CL", { timeZone: "America/Santiago" }),
        resultado: etapa === "termino" ? g.resultado : null,
      }),
      { plantilla: `cliente.gestion.${etapa}`, atencionId: g.atencionId },
    );
  }

  async completar(gestionId: string, input: CompletarGestion): Promise<Gestion> {
    const [row] = await this.db.select().from(gestiones).where(eq(gestiones.id, gestionId));
    if (!row) throw new NotFoundException(`Gestión ${gestionId} no existe`);
    await this.planDeAtencion(row.atencionId);
    await this.asegurarArancelRegularizado(row.atencionId, row.tipo);
    const ahora = new Date();
    const fechaEjecucion = input.fechaEjecucion ? new Date(input.fechaEjecucion) : ahora;
    if (fechaEjecucion.getTime() > ahora.getTime() + 60_000) {
      throw new BadRequestException("La fecha de término no puede ser futura");
    }
    if (row.fechaProgramada && fechaEjecucion < row.fechaProgramada) {
      throw new BadRequestException("La fecha de término no puede ser anterior a la de inicio");
    }
    // Escritura condicional al estado: una gestión ya completada o cancelada no se reescribe.
    const [updated] = await this.db
      .update(gestiones)
      .set({
        estado: "Completada",
        fechaEjecucion,
        resultado: input.resultado,
        documentosIds: input.documentosIds ?? row.documentosIds,
        updatedAt: ahora,
      })
      .where(and(eq(gestiones.id, gestionId), inArray(gestiones.estado, ESTADOS_GESTION_ABIERTA)))
      .returning();
    if (!updated) throw new ConflictException(`La gestión ya está ${row.estado === "Completada" ? "completada" : "cancelada"}`);
    // Una llamada, correo o reunión realizada cuenta como contacto con el cliente (plazo de 24 h
    // hábiles); se conserva el contacto más temprano.
    if (TIPOS_GESTION_CONTACTO.includes(row.tipo)) {
      await this.db
        .update(atenciones)
        .set({ fechaPrimerContacto: fechaEjecucion })
        .where(
          and(
            eq(atenciones.id, row.atencionId),
            sql`(${atenciones.fechaPrimerContacto} is null or ${atenciones.fechaPrimerContacto} > ${fechaEjecucion})`,
          ),
        );
    }
    await this.db
      .update(atenciones)
      .set({ fechaUltimaGestion: new Date(), updatedAt: new Date() })
      .where(eq(atenciones.id, row.atencionId));
    if (row.tipo === "EscritoJudicial") await this.avisarPrimeraPresentacion(row.atencionId, row.responsableId);
    if (updated.informarCliente) await this.informarCliente(updated, "termino");
    return updated;
  }

  // Anexo §VIII l.1092: la jefatura judicial revisa la primera presentación del juicio. Al completarse
  // el primer escrito se le avisa para que dé su V°B° en la ficha.
  private async avisarPrimeraPresentacion(atencionId: string, responsableId: string | null) {
    const [a] = await this.db
      .select({ tipo: atenciones.tipo, vb: atenciones.vbPrimeraPresentacion })
      .from(atenciones)
      .where(eq(atenciones.id, atencionId));
    if (!a || a.tipo !== "Juicio" || a.vb) return;
    const [n] = await this.db
      .select({ n: count() })
      .from(gestiones)
      .where(and(eq(gestiones.atencionId, atencionId), eq(gestiones.tipo, "EscritoJudicial"), eq(gestiones.estado, "Completada")));
    if (Number(n?.n ?? 0) !== 1) return;
    const equipo = await equipoDeAtencion(this.db, atencionId);
    if (!equipo) return;
    await avisar(
      this.notif,
      [equipo.jefeId],
      {
        codPlan: equipo.codPlan,
        severidad: "warn",
        titulo: `Revise la primera presentación: ${equipo.correlativo}`,
        detalle: "Primer escrito presentado; falta su V°B°",
        accionUrl: `/atenciones/${atencionId}`,
        metadata: { atencionId, primeraPresentacion: true },
      },
      responsableId,
      { servicio: this.correos, atencionId, plantilla: "juicio.primeraPresentacion" },
    );
  }

  // Anexo §VII l.797: con el arancel impago la atención queda detenida. Solo se permiten las
  // gestiones de contacto con el cliente (necesarias para gestionar el pago y el plazo de 24 h).
  private async asegurarArancelRegularizado(atencionId: string, tipo: TipoGestion): Promise<void> {
    if (TIPOS_GESTION_CONTACTO.includes(tipo)) return;
    const [ar] = await this.db
      .select({ estado: arancelesAtencion.estado })
      .from(arancelesAtencion)
      .where(eq(arancelesAtencion.atencionId, atencionId));
    if (ar && ESTADOS_ARANCEL_BLOQUEANTES.includes(ar.estado)) {
      throw new BadRequestException(
        `La atención está detenida hasta el pago del arancel (${ESTADO_ARANCEL_LABEL[ar.estado].toLowerCase()}); solo se registran llamadas, correos o reuniones con el cliente`,
      );
    }
  }

  // Plan bajo el cual se registró la atención (usado en notificaciones). 404 si el usuario
  // no puede ver la atención.
  private async planDeAtencion(atencionId: string): Promise<string> {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return a.codPlan;
  }
}
