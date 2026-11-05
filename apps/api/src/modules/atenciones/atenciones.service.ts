import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { and, eq, count, ilike, inArray, sql, desc, getTableColumns } from "drizzle-orm";
import {
  ESTADOS_PROVISION_ABIERTOS,
  ESTADO_INICIAL,
  PLANES_SIN_COBERTURA,
  riesgoTotal,
  type AtencionConMaestros,
  type CambiarEstado,
  type CreateContraparte,
  type NuevoCorrelativo,
  type TipoAtencion,
  type UpdateContraparte,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones, contrapartes, Atencion, ContraparteRow, NuevaAtencion } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { gestiones } from "../../db/schema/gestiones";
import { comites } from "../../db/schema/comites";
import { provisiones } from "../../db/schema/provisiones";
import { ArancelesAtencionService } from "../coberturas/aranceles-atencion.service";
import { cerrarProvisionesDeAtencion } from "../provisiones/provisiones.service";
import { causasTermino, competencias, materias } from "../../db/schema/maestros";
import { planesDeAfiliados } from "../afiliados/vigencia";
import { siguienteCorrelativo } from "../../common/utils/correlativo";
import { formatearRut, rutValido } from "../../common/utils/rut";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { PlantillasService } from "../gestiones/plantillas.service";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { mensajeFaltantes, validarTransicion } from "./estados";
import type { CreateAtencionDto, UpdateAtencionDto, FiltroAtencionesDto } from "./dto";

// Columnas de la atención + nombres de competencia y materia para mostrar.
const columnasConMaestros = {
  ...getTableColumns(atenciones),
  competenciaNombre: competencias.nombre,
  materiaNombre: materias.nombre,
};

const APLICA: Record<TipoAtencion, "aplicaConsulta" | "aplicaAsesoria" | "aplicaJuicio"> = {
  Consulta: "aplicaConsulta",
  Asesoria: "aplicaAsesoria",
  Juicio: "aplicaJuicio",
};

// Campos que solo existen para un tipo de atención.
const CAMPOS_CONSULTA = ["canalContacto", "tipoConsultaId", "codigoGrabacion", "respuesta"] as const;
const CAMPOS_CASO = [
  "organismoId",
  "procedimientoId",
  "tribunalId",
  "rolCausa",
  "ruc",
  "cuantiaMonto",
  "cuantiaMoneda",
  "calidadProcesalId",
  "riesgoMateria",
  "riesgoCuantia",
  "riesgoCliente",
] as const;

const ROLES_JEFATURA = ["Administrador", "Supervisor"];

export type Actor = Pick<AuthenticatedUser, "id" | "rol">;

@Injectable()
export class AtencionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
    @Inject(PlantillasService) private readonly plantillas: PlantillasService,
    @Inject(ArancelesAtencionService) private readonly arancelesAtencion: ArancelesAtencionService,
  ) {}

  async buscar(filtro: FiltroAtencionesDto) {
    // q usa full-text search (tsvector + spanish dict) con ranking;
    // ordena por relevancia cuando hay query, sino por fechaApertura.
    const ftQuery = filtro.q ? sql`plainto_tsquery('spanish', ${filtro.q})` : null;

    const where = and(
      filtro.codPlan ? eq(atenciones.codPlan, filtro.codPlan) : undefined,
      filtro.estado ? eq(atenciones.estado, filtro.estado) : undefined,
      filtro.tipo ? eq(atenciones.tipo, filtro.tipo) : undefined,
      filtro.abogadoId ? eq(atenciones.abogadoAsignadoId, filtro.abogadoId) : undefined,
      filtro.afiliadoId ? eq(atenciones.afiliadoId, filtro.afiliadoId) : undefined,
      filtro.competenciaId ? eq(atenciones.competenciaId, filtro.competenciaId) : undefined,
      filtro.materiaId ? eq(atenciones.materiaId, filtro.materiaId) : undefined,
      filtro.correlativo ? ilike(atenciones.correlativo, `%${filtro.correlativo}%`) : undefined,
      ftQuery ? sql`search_vector @@ ${ftQuery}` : undefined,
    );
    const offset = (filtro.page - 1) * filtro.pageSize;

    const orderBy = ftQuery
      ? desc(sql`ts_rank(search_vector, ${ftQuery})`)
      : desc(atenciones.fechaApertura);

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select(columnasConMaestros)
        .from(atenciones)
        .innerJoin(competencias, eq(competencias.id, atenciones.competenciaId))
        .innerJoin(materias, eq(materias.id, atenciones.materiaId))
        .where(where)
        .orderBy(orderBy)
        .limit(filtro.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(atenciones).where(where),
    ]);
    return {
      data: rows.map((r) => ({ ...r, riesgoTotal: riesgoTotal(r) })),
      page: filtro.page,
      pageSize: filtro.pageSize,
      total,
      totalPages: Math.ceil(total / filtro.pageSize),
    };
  }

  async obtener(id: string): Promise<AtencionConMaestros> {
    const [row] = await this.db
      .select(columnasConMaestros)
      .from(atenciones)
      .innerJoin(competencias, eq(competencias.id, atenciones.competenciaId))
      .innerJoin(materias, eq(materias.id, atenciones.materiaId))
      .where(eq(atenciones.id, id));
    if (!row) throw new NotFoundException(`Atención ${id} no existe`);
    return { ...row, riesgoTotal: riesgoTotal(row) } as unknown as AtencionConMaestros;
  }

  private async fila(id: string): Promise<Atencion> {
    const [row] = await this.db.select().from(atenciones).where(eq(atenciones.id, id));
    if (!row) throw new NotFoundException(`Atención ${id} no existe`);
    return row;
  }

  // La materia debe ser vigente, de la competencia indicada y aplicable al tipo de atención.
  async validarMateria(competenciaId: string, materiaId: string, tipo: TipoAtencion): Promise<void> {
    const [m] = await this.db.select().from(materias).where(eq(materias.id, materiaId));
    if (!m) throw new BadRequestException(`Materia ${materiaId} no existe`);
    if (m.competenciaId !== competenciaId) {
      throw new BadRequestException("La materia no corresponde a la competencia seleccionada");
    }
    if (!m.vigente) throw new BadRequestException(`La materia '${m.nombre}' no está vigente`);
    if (!m[APLICA[tipo]]) {
      throw new BadRequestException(`La materia '${m.nombre}' no aplica a atenciones de tipo ${tipo}`);
    }
  }

  // Anexo §VI 3.1: la atención se registra bajo un plan vigente del RUT; si no tiene
  // ninguno, solo bajo REZAGADO o METLIFE.
  private async validarPlanDeAtencion(afiliadoId: string, codPlan: string): Promise<void> {
    const [afi] = await this.db
      .select({ id: afiliados.id, rut: afiliados.rut, vigencia: afiliados.vigencia })
      .from(afiliados)
      .where(eq(afiliados.id, afiliadoId));
    if (!afi) throw new NotFoundException(`Afiliado ${afiliadoId} no existe`);
    if (afi.vigencia === "Eliminado") {
      throw new ConflictException(`El afiliado ${afi.rut} está eliminado`);
    }
    const planes = (await planesDeAfiliados(this.db, [afiliadoId])).get(afiliadoId) ?? [];
    const vigentes = planes.filter((p) => p.vigente).map((p) => p.codPlan);
    if (vigentes.includes(codPlan)) return;
    const sinCobertura = (PLANES_SIN_COBERTURA as readonly string[]).includes(codPlan);
    if (vigentes.length === 0 && sinCobertura) return;
    if (vigentes.length === 0) {
      throw new BadRequestException(
        `El RUT ${afi.rut} no tiene planes vigentes; registre la atención como ${PLANES_SIN_COBERTURA.join(" o ")}`,
      );
    }
    throw new BadRequestException(
      `El plan ${codPlan} no está vigente para el RUT ${afi.rut}. Planes vigentes: ${vigentes.join(", ")}`,
    );
  }

  // Quita los campos que no corresponden al tipo (p. ej. tribunal en una consulta).
  private limpiarPorTipo<T extends Record<string, unknown>>(tipo: TipoAtencion, data: T): T {
    const fuera: readonly string[] = tipo === "Consulta" ? CAMPOS_CASO : CAMPOS_CONSULTA;
    const out = { ...data };
    for (const k of fuera) delete out[k];
    return out;
  }

  async crear(
    input: CreateAtencionDto & { tipo: TipoAtencion },
    actor?: Actor,
    extra: Partial<NuevaAtencion> = {},
  ): Promise<Atencion> {
    const codPlan = input.codPlan;
    await this.validarPlanDeAtencion(input.afiliadoId, codPlan);
    await this.validarMateria(input.competenciaId, input.materiaId, input.tipo);

    const correlativo = await siguienteCorrelativo(this.db, input.tipo);
    const datos = this.limpiarPorTipo(input.tipo, { ...input });
    const payload: NuevaAtencion = {
      ...datos,
      ...extra,
      tipo: input.tipo,
      codPlan,
      correlativo,
      estado: ESTADO_INICIAL[input.tipo],
      horaInicio: input.tipo === "Consulta" ? new Date() : null,
    };
    const [row] = await this.db.insert(atenciones).values(payload).returning();

    if (row.tipo !== "Consulta") {
      // El copago del plan define si la atención queda detenida esperando el arancel.
      await this.arancelesAtencion.crearParaAtencion(row.id, actor?.id ?? null);
      const responsableId = row.abogadoAsignadoId ?? actor?.id;
      if (responsableId) {
        await this.plantillas.instanciar({
          atencionId: row.id,
          materiaId: row.materiaId,
          procedimientoId: row.procedimientoId,
          responsableId,
        });
      }
    }

    await this.webhooks.emitir(codPlan, "atencion.creada", { atencion: row });
    if (row.abogadoAsignadoId) {
      await this.notif.crear({
        codPlan,
        usuarioId: row.abogadoAsignadoId,
        severidad: "info",
        titulo: `Nueva ${row.tipo}: ${row.correlativo}`,
        detalle: row.asunto,
        accionUrl: `/atenciones/${row.id}`,
        metadata: { atencionId: row.id, tipo: row.tipo },
      });
    }
    return row;
  }

  async actualizar(id: string, patch: UpdateAtencionDto, actor?: Actor): Promise<Atencion> {
    const actual = await this.fila(id);
    if (patch.revisadoPorComite !== undefined && !ROLES_JEFATURA.includes(actor?.rol ?? "")) {
      throw new ForbiddenException("Solo Supervisor o Administrador marcan 'Revisado por comité'");
    }
    if (patch.competenciaId || patch.materiaId) {
      await this.validarMateria(
        patch.competenciaId ?? actual.competenciaId,
        patch.materiaId ?? actual.materiaId,
        actual.tipo,
      );
    }
    const datos = this.limpiarPorTipo(actual.tipo, { ...patch });
    const [row] = await this.db
      .update(atenciones)
      .set({ ...datos, updatedAt: new Date() })
      .where(eq(atenciones.id, id))
      .returning();

    if (row.tipo !== "Consulta" && row.materiaId !== actual.materiaId) {
      await this.arancelesAtencion.recalcular(row.id, actor?.id ?? null);
    }

    // Al definir el procedimiento de un juicio se agregan sus gestiones predefinidas.
    if (row.tipo === "Juicio" && patch.procedimientoId && patch.procedimientoId !== actual.procedimientoId) {
      const responsableId = row.abogadoAsignadoId ?? actor?.id;
      if (responsableId) {
        await this.plantillas.instanciar({
          atencionId: row.id,
          materiaId: null,
          procedimientoId: row.procedimientoId,
          responsableId,
        });
      }
    }
    return row;
  }

  async cambiarEstado(id: string, input: CambiarEstado, actor?: Actor): Promise<Atencion> {
    const actual = await this.fila(id);
    const causaTerminoId = input.causaTerminoId ?? actual.causaTerminoId;
    if (input.causaTerminoId) {
      const [c] = await this.db.select({ id: causasTermino.id }).from(causasTermino).where(eq(causasTermino.id, input.causaTerminoId));
      if (!c) throw new BadRequestException(`Causa de término ${input.causaTerminoId} no existe`);
    }

    const [[g], [c], [p], bloqueoArancel] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(gestiones)
        .where(and(eq(gestiones.atencionId, id), inArray(gestiones.estado, ["Pendiente", "Vencida"]))),
      this.db
        .select({ n: count() })
        .from(comites)
        .where(and(eq(comites.atencionId, id), inArray(comites.estado, ["Convocado", "EnSesion"]))),
      this.db
        .select({ n: count() })
        .from(provisiones)
        .where(and(eq(provisiones.atencionId, id), inArray(provisiones.estado, [...ESTADOS_PROVISION_ABIERTOS]))),
      actual.tipo === "Consulta" ? Promise.resolve(null) : this.arancelesAtencion.bloqueo(id),
    ]);

    const faltan = validarTransicion({ ...actual, causaTerminoId }, input.estado, {
      gestionesPendientes: Number(g?.n ?? 0),
      comitesAbiertos: Number(c?.n ?? 0),
      provisionesAbiertas: Number(p?.n ?? 0),
      bloqueoArancel,
    });
    if (faltan.length > 0) throw new BadRequestException(mensajeFaltantes(input.estado, faltan));

    const ahora = new Date();
    const cierra = ["Terminada", "Abandonada"].includes(input.estado);
    const set: Partial<NuevaAtencion> = {
      estado: input.estado,
      causaTerminoId,
      updatedAt: ahora,
    };
    if (cierra) set.fechaCierre = input.fechaTermino ? new Date(input.fechaTermino) : ahora;
    if (actual.tipo === "Consulta" && ["Respondida", "Terminada"].includes(input.estado) && !actual.horaTermino) {
      set.horaTermino = ahora;
      if (input.estado === "Terminada") set.fechaCierre = ahora;
    }
    if (input.observacion) {
      set.metadata = { ...(actual.metadata ?? {}), ultimaObservacionEstado: input.observacion };
    }
    const [row] = await this.db.update(atenciones).set(set).where(eq(atenciones.id, id)).returning();
    if (row.estado === "Terminada") await cerrarProvisionesDeAtencion(this.db, id, actor?.id ?? null);
    await this.webhooks.emitir(row.codPlan, "atencion.estado", { atencionId: id, desde: actual.estado, hasta: row.estado });
    return row;
  }

  // Anexo §VI 3.5.1: varias consultas en la misma llamada generan un correlativo cada una.
  async nuevoCorrelativo(consultaId: string, input: NuevoCorrelativo, actor?: Actor): Promise<Atencion> {
    const origen = await this.fila(consultaId);
    if (origen.tipo !== "Consulta") throw new BadRequestException("Solo una consulta admite nuevo correlativo");
    return this.crear(
      {
        codPlan: origen.codPlan,
        afiliadoId: origen.afiliadoId,
        competenciaId: input.competenciaId,
        materiaId: input.materiaId,
        asunto: input.asunto,
        canalContacto: origen.canalContacto,
        tipoConsultaId: input.tipoConsultaId ?? origen.tipoConsultaId,
        codigoGrabacion: origen.codigoGrabacion,
        respuesta: input.respuesta ?? null,
        abogadoAsignadoId: origen.abogadoAsignadoId,
        prioridad: origen.prioridad,
        tipo: "Consulta",
      } as CreateAtencionDto & { tipo: TipoAtencion },
      actor,
      { metadata: { correlativoOrigen: origen.correlativo } },
    );
  }

  // --- Contrapartes ---

  async listarContrapartes(atencionId: string): Promise<ContraparteRow[]> {
    await this.fila(atencionId);
    return this.db
      .select()
      .from(contrapartes)
      .where(and(eq(contrapartes.atencionId, atencionId), eq(contrapartes.vigente, true)));
  }

  private normalizarRut(rut: string | null | undefined): string | null | undefined {
    if (rut === undefined || rut === null || rut === "") return rut === "" ? null : rut;
    if (!rutValido(rut)) throw new BadRequestException(`RUT de contraparte inválido: ${rut}`);
    return formatearRut(rut);
  }

  async crearContraparte(atencionId: string, input: CreateContraparte): Promise<ContraparteRow> {
    const a = await this.fila(atencionId);
    if (a.tipo === "Consulta") throw new BadRequestException("Las consultas no registran contraparte");
    const [row] = await this.db
      .insert(contrapartes)
      .values({ ...input, rut: this.normalizarRut(input.rut) ?? null, atencionId })
      .returning();
    return row;
  }

  async actualizarContraparte(id: string, patch: UpdateContraparte): Promise<ContraparteRow> {
    const rut = this.normalizarRut(patch.rut);
    const [row] = await this.db
      .update(contrapartes)
      .set({ ...patch, ...(rut !== undefined ? { rut } : {}), updatedAt: new Date() })
      .where(eq(contrapartes.id, id))
      .returning();
    if (!row) throw new NotFoundException(`Contraparte ${id} no existe`);
    return row;
  }

  // Ley 19.628: la contraparte se desactiva, no se borra.
  async eliminarContraparte(id: string): Promise<ContraparteRow> {
    const [row] = await this.db
      .update(contrapartes)
      .set({ vigente: false, updatedAt: new Date() })
      .where(eq(contrapartes.id, id))
      .returning();
    if (!row) throw new NotFoundException(`Contraparte ${id} no existe`);
    return row;
  }
}
