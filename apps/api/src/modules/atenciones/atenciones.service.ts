import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { and, eq, count, ilike } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones, Atencion, NuevaAtencion } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { siguienteCorrelativo } from "../../common/utils/correlativo";
import type {
  CreateAtencionDto,
  UpdateAtencionDto,
  DerivarAtencionDto,
  FiltroAtencionesDto,
} from "./dto";

@Injectable()
export class AtencionesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async buscar(codPlan: string, filtro: FiltroAtencionesDto) {
    const where = and(
      eq(atenciones.codPlan, codPlan),
      filtro.estado ? eq(atenciones.estado, filtro.estado) : undefined,
      filtro.tipo ? eq(atenciones.tipo, filtro.tipo) : undefined,
      filtro.abogadoId ? eq(atenciones.abogadoAsignadoId, filtro.abogadoId) : undefined,
      filtro.afiliadoId ? eq(atenciones.afiliadoId, filtro.afiliadoId) : undefined,
      filtro.correlativo ? ilike(atenciones.correlativo, `%${filtro.correlativo}%`) : undefined,
    );
    const offset = (filtro.page - 1) * filtro.pageSize;
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(atenciones)
        .where(where)
        .orderBy(atenciones.fechaApertura)
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

  async obtener(codPlan: string, id: string): Promise<Atencion> {
    const [row] = await this.db
      .select()
      .from(atenciones)
      .where(and(eq(atenciones.id, id), eq(atenciones.codPlan, codPlan)));
    if (!row) throw new NotFoundException(`Atención ${id} no existe en plan ${codPlan}`);
    return row;
  }

  async crear(
    codPlan: string,
    input: CreateAtencionDto & { tipo: "Consulta" | "Asesoria" | "Juicio" },
  ): Promise<Atencion> {
    // Verifica que el afiliado exista en el plan.
    const [afi] = await this.db
      .select({ id: afiliados.id, vigencia: afiliados.vigencia })
      .from(afiliados)
      .where(and(eq(afiliados.id, input.afiliadoId), eq(afiliados.codPlan, codPlan)));
    if (!afi) {
      throw new NotFoundException(`Afiliado ${input.afiliadoId} no existe en plan ${codPlan}`);
    }
    if (afi.vigencia !== "Activo") {
      throw new ConflictException("No se puede crear atención para afiliado no vigente");
    }

    const correlativo = await siguienteCorrelativo(this.db, codPlan, input.tipo);
    const payload: NuevaAtencion = {
      ...input,
      tipo: input.tipo,
      codPlan,
      correlativo,
      estado: input.estado ?? "Abierta",
    };
    const [row] = await this.db.insert(atenciones).values(payload).returning();
    return row;
  }

  async actualizar(codPlan: string, id: string, patch: UpdateAtencionDto): Promise<Atencion> {
    await this.obtener(codPlan, id);
    const [row] = await this.db
      .update(atenciones)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(atenciones.id, id), eq(atenciones.codPlan, codPlan)))
      .returning();
    return row;
  }

  // Derivar: Consulta -> Asesoría -> Juicio. Crea nueva atención enlazada por metadata.
  async derivar(codPlan: string, payload: DerivarAtencionDto): Promise<Atencion> {
    const origen = await this.obtener(codPlan, payload.atencionId);
    if (origen.tipo === "Juicio") {
      throw new BadRequestException("No se puede derivar un juicio");
    }
    if (origen.tipo === "Asesoria" && payload.nuevoTipo === "Asesoria") {
      throw new BadRequestException("Asesoría ya está en ese estado; use Juicio");
    }

    const correlativo = await siguienteCorrelativo(this.db, codPlan, payload.nuevoTipo);
    const [nueva] = await this.db
      .insert(atenciones)
      .values({
        codPlan,
        correlativo,
        afiliadoId: origen.afiliadoId,
        tipo: payload.nuevoTipo,
        estado: "Abierta",
        competencia: origen.competencia,
        materia: origen.materia,
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

    return nueva;
  }
}
