import { Inject, Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { comites, compromisosComite, participantesComite, NuevoComite } from "../../db/schema/comites";
import { usuarios } from "../../db/schema/usuarios";
import { hoyChileISO } from "../../common/utils/dias-habiles";
import { atenciones } from "../../db/schema/atenciones";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import type { BitacoraComite, CompromisoComite, ConvocarComite, CrearCompromiso, ValidarCompromiso } from "@legalmene/shared";

const responsable = alias(usuarios, "responsable");
const validador = alias(usuarios, "validador");
const autor = alias(usuarios, "autor");
const ABIERTO = ["Convocado", "EnSesion"] as const;

@Injectable()
export class ComitesService {
  private readonly logger = new Logger(ComitesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
  ) {}

  async listarPorAtencion(atencionId: string) {
    await this.planDeAtencion(atencionId);
    return this.db.select().from(comites).where(eq(comites.atencionId, atencionId));
  }

  async convocar(convocadoPor: string, input: ConvocarComite) {
    const codPlan = await this.planDeAtencion(input.atencionId);

    return this.db.transaction(async (tx) => {
      const [comite] = await tx
        .insert(comites)
        .values({
          atencionId: input.atencionId,
          convocadoPor,
          motivo: input.motivo,
          fechaSesion: input.fechaSesion ? new Date(input.fechaSesion) : null,
        } satisfies NuevoComite)
        .returning();

      await tx.insert(participantesComite).values(
        input.participantesIds.map((usuarioId, idx) => ({
          comiteId: comite.id,
          usuarioId,
          rol: idx === 0 ? ("Presidente" as const) : ("Miembro" as const),
        })),
      );

      // Solo un caso en trabajo pasa a comité; las consultas y los casos en espera no cambian.
      await tx
        .update(atenciones)
        .set({ estado: "EnComite", updatedAt: new Date() })
        .where(and(eq(atenciones.id, input.atencionId), inArray(atenciones.estado, ["Pendiente", "EnGestion"])));

      return comite;
    }).then(async (comite) => {
      // Notif persistente a cada participante. Out-of-transaction
      // porque un error de inbox no debe abortar la convocatoria.
      await this.notif.crearBulk(
        input.participantesIds.map((usuarioId) => ({
          codPlan,
          usuarioId,
          severidad: "warn" as const,
          titulo: "Convocado a comité",
          detalle: input.motivo,
          accionUrl: `/atenciones/${input.atencionId}`,
          metadata: { comiteId: comite.id, atencionId: input.atencionId },
        })),
      );
      return comite;
    });
  }

  async votar(
    comiteId: string,
    usuarioId: string,
    voto: "AFavor" | "EnContra" | "Abstencion",
    comentario?: string,
  ) {
    const [comite] = await this.db.select().from(comites).where(eq(comites.id, comiteId));
    if (!comite) throw new NotFoundException(`Comité ${comiteId} no existe`);
    if (comite.estado === "Cerrado" || comite.estado === "Cancelado") {
      throw new BadRequestException(`Comité ya está ${comite.estado}, no admite votos`);
    }
    const [updated] = await this.db
      .update(participantesComite)
      .set({ voto, comentario: comentario ?? null })
      .where(
        and(
          eq(participantesComite.comiteId, comiteId),
          eq(participantesComite.usuarioId, usuarioId),
        ),
      )
      .returning();
    if (!updated) {
      throw new BadRequestException("Usuario no es participante del comité");
    }
    return updated;
  }

  async cerrar(
    comiteId: string,
    decision: "Aprobado" | "Rechazado" | "Diferido",
    acta: string,
  ) {
    const [comite] = await this.db.select().from(comites).where(eq(comites.id, comiteId));
    if (!comite) throw new NotFoundException(`Comité ${comiteId} no existe`);
    await this.planDeAtencion(comite.atencionId);
    // Los compromisos de comités anteriores se validan en esta sesión (Anexo §VIII l.1142).
    const [pendiente] = await this.db
      .select({ id: compromisosComite.id })
      .from(compromisosComite)
      .where(this.anterioresPendientes(comite))
      .limit(1);
    if (pendiente) {
      throw new BadRequestException("Antes de cerrar, valide los compromisos pendientes de comités anteriores de esta atención");
    }
    const [updated] = await this.db
      .update(comites)
      .set({
        estado: "Cerrado",
        decision,
        acta,
        fechaCierre: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(comites.id, comiteId), inArray(comites.estado, ["Convocado", "EnSesion"])))
      .returning();
    if (!updated) throw new ConflictException(`El comité ya está ${comite.estado.toLowerCase()}; su decisión no se puede cambiar`);
    await this.db
      .update(atenciones)
      .set({ estado: "EnGestion", updatedAt: new Date() })
      .where(and(eq(atenciones.id, comite.atencionId), eq(atenciones.estado, "EnComite")));
    return updated;
  }

  // Pendientes de comités anteriores de la misma atención (convocados antes que este).
  private anterioresPendientes(comite: { id: string; atencionId: string; fechaConvocatoria: Date }) {
    return and(
      eq(compromisosComite.atencionId, comite.atencionId),
      ne(compromisosComite.comiteId, comite.id),
      eq(compromisosComite.estado, "Pendiente"),
      sql`${compromisosComite.comiteId} in (select c.id from comites c where c.atencion_id = ${comite.atencionId} and c.fecha_convocatoria < ${comite.fechaConvocatoria})`,
    );
  }

  private async comiteVisible(comiteId: string) {
    const [comite] = await this.db.select().from(comites).where(eq(comites.id, comiteId));
    if (!comite) throw new NotFoundException(`Comité ${comiteId} no existe`);
    await this.planDeAtencion(comite.atencionId);
    return comite;
  }

  private async compromisos(where: ReturnType<typeof and>): Promise<CompromisoComite[]> {
    const hoy = hoyChileISO();
    const filas = await this.db
      .select({
        c: compromisosComite,
        responsableNombre: responsable.nombre,
        validadoPorNombre: validador.nombre,
        creadoPorNombre: autor.nombre,
      })
      .from(compromisosComite)
      .innerJoin(responsable, eq(responsable.id, compromisosComite.responsableId))
      .innerJoin(autor, eq(autor.id, compromisosComite.creadoPorId))
      .leftJoin(validador, eq(validador.id, compromisosComite.validadoPorId))
      .where(where)
      .orderBy(asc(compromisosComite.fechaCompromiso), asc(compromisosComite.createdAt));
    return filas.map(({ c, responsableNombre, validadoPorNombre, creadoPorNombre }) => ({
      id: c.id,
      comiteId: c.comiteId,
      atencionId: c.atencionId,
      descripcion: c.descripcion,
      responsableId: c.responsableId,
      responsableNombre,
      fechaCompromiso: c.fechaCompromiso,
      estado: c.estado,
      vencido: c.estado === "Pendiente" && c.fechaCompromiso < hoy,
      validadoEnComiteId: c.validadoEnComiteId,
      validadoPorNombre,
      validadoAt: c.validadoAt?.toISOString() ?? null,
      observacion: c.observacion,
      creadoPorNombre,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  // Bitácora: lo comprometido en este comité y lo de comités anteriores que se valida en él.
  async bitacora(comiteId: string): Promise<BitacoraComite> {
    const comite = await this.comiteVisible(comiteId);
    const [propios, anterioresPorValidar] = await Promise.all([
      this.compromisos(and(eq(compromisosComite.comiteId, comiteId))),
      this.compromisos(or(this.anterioresPendientes(comite), eq(compromisosComite.validadoEnComiteId, comiteId))),
    ]);
    return { propios, anterioresPorValidar };
  }

  // Registra un compromiso mientras el comité está abierto. Lo registra un participante o quien
  // convoca comités; el responsable debe ser un usuario activo.
  async agregarCompromiso(comiteId: string, actor: { id: string; permisos: readonly string[] }, input: CrearCompromiso) {
    const comite = await this.comiteVisible(comiteId);
    if (!(ABIERTO as readonly string[]).includes(comite.estado)) {
      throw new BadRequestException(`El comité está ${comite.estado.toLowerCase()}; no admite compromisos`);
    }
    if (!actor.permisos.includes("comites.convocar")) {
      const [p] = await this.db
        .select({ id: participantesComite.id })
        .from(participantesComite)
        .where(and(eq(participantesComite.comiteId, comiteId), eq(participantesComite.usuarioId, actor.id)));
      if (!p) throw new ForbiddenException("Solo los participantes del comité registran compromisos");
    }
    const [u] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.id, input.responsableId), eq(usuarios.activo, true)));
    if (!u) throw new BadRequestException("El responsable no existe o no está activo");
    const [row] = await this.db
      .insert(compromisosComite)
      .values({
        comiteId,
        atencionId: comite.atencionId,
        descripcion: input.descripcion,
        responsableId: input.responsableId,
        fechaCompromiso: input.fechaCompromiso,
        creadoPorId: actor.id,
      })
      .returning();
    const codPlan = await this.planDeAtencion(comite.atencionId);
    await this.notif.crearBulk([
      {
        codPlan,
        usuarioId: input.responsableId,
        severidad: "info",
        titulo: "Compromiso de comité a su cargo",
        detalle: `${input.descripcion.slice(0, 160)} (plazo ${input.fechaCompromiso.split("-").reverse().join("-")})`,
        accionUrl: `/atenciones/${comite.atencionId}`,
        metadata: { compromisoId: row.id, comiteId },
      },
    ]);
    const [creado] = await this.compromisos(and(eq(compromisosComite.id, row.id)));
    return creado;
  }

  // Valida un compromiso de un comité anterior de la misma atención, en este comité abierto.
  async validarCompromiso(comiteId: string, compromisoId: string, actorId: string, input: ValidarCompromiso) {
    const comite = await this.comiteVisible(comiteId);
    if (!(ABIERTO as readonly string[]).includes(comite.estado)) {
      throw new BadRequestException(`El comité está ${comite.estado.toLowerCase()}; no admite validaciones`);
    }
    const [c] = await this.db.select().from(compromisosComite).where(eq(compromisosComite.id, compromisoId));
    if (!c || c.atencionId !== comite.atencionId) throw new NotFoundException(`Compromiso ${compromisoId} no existe`);
    if (c.comiteId === comiteId) {
      throw new BadRequestException("Un compromiso se valida en el comité siguiente, no en el que se registró");
    }
    const [origen] = await this.db.select({ f: comites.fechaConvocatoria }).from(comites).where(eq(comites.id, c.comiteId));
    if (!origen || origen.f >= comite.fechaConvocatoria) {
      throw new BadRequestException("Solo se validan compromisos de comités anteriores");
    }
    const [row] = await this.db
      .update(compromisosComite)
      .set({
        estado: input.estado,
        observacion: input.observacion ?? null,
        validadoEnComiteId: comiteId,
        validadoPorId: actorId,
        validadoAt: new Date(),
      })
      .where(and(eq(compromisosComite.id, compromisoId), eq(compromisosComite.estado, "Pendiente")))
      .returning({ id: compromisosComite.id });
    if (!row) throw new ConflictException("El compromiso ya fue validado");
    const [validado] = await this.compromisos(and(eq(compromisosComite.id, compromisoId)));
    return validado;
  }

  // Cada día hábil a las 08:40 de Chile: avisa al responsable de cada compromiso vencido.
  @Cron("40 12 * * 1-5")
  async avisarCompromisosVencidos(): Promise<number> {
    const vencidos = await this.db
      .select({ c: compromisosComite, codPlan: atenciones.codPlan, correlativo: atenciones.correlativo })
      .from(compromisosComite)
      .innerJoin(atenciones, eq(atenciones.id, compromisosComite.atencionId))
      .where(and(eq(compromisosComite.estado, "Pendiente"), lt(compromisosComite.fechaCompromiso, hoyChileISO())));
    let avisos = 0;
    for (const { c, codPlan, correlativo } of vencidos) {
      const creada = await this.notif.crearSiNoExisteUnseen(
        {
          codPlan,
          usuarioId: c.responsableId,
          severidad: "critical",
          titulo: `Compromiso de comité vencido (${correlativo})`,
          detalle: c.descripcion.slice(0, 200),
          accionUrl: `/atenciones/${c.atencionId}`,
          metadata: { compromisoVencido: c.id },
        },
        "compromisoVencido",
        c.id,
      );
      if (creada) avisos++;
    }
    if (avisos) this.logger.log(`Avisos de compromisos vencidos: ${avisos}`);
    return avisos;
  }

  // Devuelve el plan bajo el cual se registró la atención (usado en notificaciones).
  private async planDeAtencion(atencionId: string): Promise<string> {
    const [a] = await this.db
      .select({ codPlan: atenciones.codPlan })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), filtroAtenciones()));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return a.codPlan;
  }
}
