import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { and, eq, count, ilike, sql, desc, getTableColumns } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones, Atencion, NuevaAtencion } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { PLANES_SIN_COBERTURA } from "@legalmene/shared";
import { planesDeAfiliados } from "../afiliados/vigencia";
import { competencias, materias } from "../../db/schema/maestros";
import { siguienteCorrelativo } from "../../common/utils/correlativo";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import type { AtencionConMaestros, TipoAtencion } from "@legalmene/shared";
import type {
  CreateAtencionDto,
  UpdateAtencionDto,
  DerivarAtencionDto,
  FiltroAtencionesDto,
} from "./dto";

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

@Injectable()
export class AtencionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
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
      data: rows,
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
    return row as unknown as AtencionConMaestros;
  }

  // La materia debe ser vigente, de la competencia indicada y aplicable al tipo de atención.
  private async validarMateria(competenciaId: string, materiaId: string, tipo: TipoAtencion): Promise<void> {
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

  async crear(
    input: CreateAtencionDto & { tipo: "Consulta" | "Asesoria" | "Juicio" },
  ): Promise<Atencion> {
    const codPlan = input.codPlan;
    await this.validarPlanDeAtencion(input.afiliadoId, codPlan);
    await this.validarMateria(input.competenciaId, input.materiaId, input.tipo);

    const correlativo = await siguienteCorrelativo(this.db, input.tipo);
    const payload: NuevaAtencion = {
      ...input,
      tipo: input.tipo,
      codPlan,
      correlativo,
      estado: input.estado ?? "Abierta",
    };
    const [row] = await this.db.insert(atenciones).values(payload).returning();
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

  async actualizar(id: string, patch: UpdateAtencionDto): Promise<Atencion> {
    const actual = await this.obtener(id);
    if (patch.competenciaId || patch.materiaId) {
      await this.validarMateria(
        patch.competenciaId ?? actual.competenciaId,
        patch.materiaId ?? actual.materiaId,
        actual.tipo,
      );
    }
    const [row] = await this.db
      .update(atenciones)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(atenciones.id, id))
      .returning();
    return row;
  }

  // Derivar: Consulta -> Asesoría -> Juicio. Crea nueva atención enlazada por metadata.
  async derivar(payload: DerivarAtencionDto): Promise<Atencion> {
    const origen = await this.obtener(payload.atencionId);
    const codPlan = origen.codPlan;
    if (origen.tipo === "Juicio") {
      throw new BadRequestException("No se puede derivar un juicio");
    }
    if (origen.tipo === "Asesoria" && payload.nuevoTipo === "Asesoria") {
      throw new BadRequestException("Asesoría ya está en ese estado; use Juicio");
    }

    const correlativo = await siguienteCorrelativo(this.db, payload.nuevoTipo);
    const [nueva] = await this.db
      .insert(atenciones)
      .values({
        codPlan,
        correlativo,
        afiliadoId: origen.afiliadoId,
        tipo: payload.nuevoTipo,
        estado: "Abierta",
        competenciaId: origen.competenciaId,
        materiaId: origen.materiaId,
        asunto: origen.asunto,
        descripcion: origen.descripcion,
        abogadoAsignadoId: payload.abogadoDestinoId ?? origen.abogadoAsignadoId,
        prioridad: origen.prioridad,
        metadata: { derivadaDe: origen.id, motivoDerivacion: payload.motivo },
      })
      .returning();

    await this.db
      .update(atenciones)
      .set({ estado: "Cerrada", fechaCierre: new Date(), updatedAt: new Date() })
      .where(eq(atenciones.id, origen.id));

    await this.webhooks.emitir(codPlan, "atencion.derivada", { origen, nueva });
    if (nueva.abogadoAsignadoId) {
      await this.notif.crear({
        codPlan,
        usuarioId: nueva.abogadoAsignadoId,
        severidad: "warn",
        titulo: `Derivada a ${nueva.tipo}: ${nueva.correlativo}`,
        detalle: `Desde ${origen.correlativo} — ${payload.motivo}`,
        accionUrl: `/atenciones/${nueva.id}`,
        metadata: { atencionId: nueva.id, origenId: origen.id, tipo: nueva.tipo },
      });
    }
    return nueva;
  }
}
