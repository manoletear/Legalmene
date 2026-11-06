import type { CriteriosBusqueda } from "@legalmene/shared";
import { condicionAtencion } from "../../common/busqueda/criterios";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";
import type {
  AprobarDerivacion,
  DerivacionRow,
  EstadoDerivacion,
  RechazarDerivacion,
  SolicitarDerivacion,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones, derivaciones, Atencion, Derivacion } from "../../db/schema/atenciones";
import { usuarios } from "../../db/schema/usuarios";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AtencionesService, Actor } from "./atenciones.service";
import type { CreateAtencionDto } from "./dto";
import { filtroAtenciones } from "../../common/acceso/alcance";

export interface FiltroDerivaciones extends CriteriosBusqueda {
  estado?: EstadoDerivacion;
  consultaId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class DerivacionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AtencionesService) private readonly atencionesSrv: AtencionesService,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
  ) {}

  async listar(f: FiltroDerivaciones = {}) {
    const page = f.page ?? 1;
    const pageSize = Math.min(f.pageSize ?? 50, 200);
    // Solo derivaciones de consultas que el usuario puede ver (la jefatura, las de su equipo).
    const where = and(
      filtroAtenciones(),
      f.estado ? eq(derivaciones.estado, f.estado) : undefined,
      f.consultaId ? eq(derivaciones.consultaId, f.consultaId) : undefined,
      condicionAtencion(f, derivaciones.createdAt),
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: derivaciones.id,
          consultaId: derivaciones.consultaId,
          consultaCorrelativo: atenciones.correlativo,
          asunto: atenciones.asunto,
          nuevoTipo: derivaciones.nuevoTipo,
          motivo: derivaciones.motivo,
          estado: derivaciones.estado,
          solicitadaPorEmail: usuarios.email,
          observacion: derivaciones.observacion,
          atencionDerivadaId: derivaciones.atencionDerivadaId,
          createdAt: derivaciones.createdAt,
          resueltaAt: derivaciones.resueltaAt,
        })
        .from(derivaciones)
        .innerJoin(atenciones, eq(atenciones.id, derivaciones.consultaId))
        .innerJoin(usuarios, eq(usuarios.id, derivaciones.solicitadaPorId))
        .where(where)
        .orderBy(desc(derivaciones.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(derivaciones)
        .innerJoin(atenciones, eq(atenciones.id, derivaciones.consultaId))
        .where(where),
    ]);
    return {
      data: rows as unknown as DerivacionRow[],
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
    };
  }

  async solicitar(consultaId: string, usuarioId: string, input: SolicitarDerivacion): Promise<Derivacion> {
    const consulta = await this.atencionesSrv.obtener(consultaId);
    if (consulta.tipo !== "Consulta") throw new BadRequestException("Solo una consulta se deriva");
    if (!["Iniciada", "Respondida"].includes(consulta.estado)) {
      throw new BadRequestException(`No se puede derivar una consulta en estado ${consulta.estado}`);
    }
    const [pendiente] = await this.db
      .select({ id: derivaciones.id })
      .from(derivaciones)
      .where(and(eq(derivaciones.consultaId, consultaId), eq(derivaciones.estado, "Solicitada")));
    if (pendiente) throw new ConflictException("La consulta ya tiene una derivación pendiente de aprobación");

    const [row] = await this.db
      .insert(derivaciones)
      .values({ consultaId, nuevoTipo: input.nuevoTipo, motivo: input.motivo, solicitadaPorId: usuarioId })
      .returning();
    return row;
  }

  private async pendiente(id: string): Promise<Derivacion> {
    const [d] = await this.db.select().from(derivaciones).where(eq(derivaciones.id, id));
    if (!d) throw new NotFoundException(`Derivación ${id} no existe`);
    if (d.estado !== "Solicitada") throw new ConflictException(`La derivación ya fue resuelta (${d.estado})`);
    return d;
  }

  // Aprobar crea la asesoría/juicio (estado Asignada) con el mismo afiliado, plan y materia,
  // y deja la consulta en Derivada.
  async aprobar(id: string, actor: Actor, input: AprobarDerivacion): Promise<{ derivacion: Derivacion; atencion: Atencion }> {
    const d = await this.pendiente(id);
    if (d.solicitadaPorId === actor.id) throw new ForbiddenException("Quien solicitó la derivación no puede resolverla");
    const consulta = await this.atencionesSrv.obtener(d.consultaId);
    const competenciaId = input.competenciaId ?? consulta.competenciaId;
    const materiaId = input.materiaId ?? consulta.materiaId;
    try {
      await this.atencionesSrv.validarMateria(competenciaId, materiaId, d.nuevoTipo);
    } catch (err) {
      if (err instanceof BadRequestException && !input.materiaId) {
        throw new BadRequestException(
          `${(err.getResponse() as { message?: string }).message ?? err.message}. Elija otra materia al aprobar la derivación.`,
        );
      }
      throw err;
    }

    // Reclamo atómico: solo una aprobación pasa de Solicitada; la otra recibe 409 y no crea nada.
    const ahora = new Date();
    const [reclamada] = await this.db
      .update(derivaciones)
      .set({ estado: "Aprobada", resueltaPorId: actor.id, observacion: input.observacion ?? null, resueltaAt: ahora })
      .where(and(eq(derivaciones.id, id), eq(derivaciones.estado, "Solicitada")))
      .returning();
    if (!reclamada) throw new ConflictException("La derivación ya fue resuelta");

    let nueva: Atencion;
    try {
      nueva = await this.atencionesSrv.crear(
      {
        codPlan: consulta.codPlan,
        afiliadoId: consulta.afiliadoId,
        competenciaId,
        materiaId,
        asunto: consulta.asunto,
        descripcion: consulta.descripcion,
        abogadoAsignadoId: input.abogadoDestinoId ?? consulta.abogadoAsignadoId,
        prioridad: consulta.prioridad,
        tipo: d.nuevoTipo,
      } as CreateAtencionDto & { tipo: "Asesoria" | "Juicio" },
      actor,
      // Quien pidió la derivación sigue viendo el caso aunque no quede como abogado asignado.
      { metadata: { derivadaDe: consulta.id, motivoDerivacion: d.motivo }, creadoPorId: d.solicitadaPorId },
      );
    } catch (err) {
      // Si no se pudo crear el caso, la derivación vuelve a quedar pendiente.
      await this.db
        .update(derivaciones)
        .set({ estado: "Solicitada", resueltaPorId: null, observacion: null, resueltaAt: null })
        .where(and(eq(derivaciones.id, id), eq(derivaciones.estado, "Aprobada")));
      throw err;
    }

    const [derivacion] = await this.db
      .update(derivaciones)
      .set({ atencionDerivadaId: nueva.id })
      .where(eq(derivaciones.id, id))
      .returning();
    await this.db
      .update(atenciones)
      .set({
        estado: "Derivada",
        fechaCierre: ahora,
        horaTermino: consulta.horaTermino ? new Date(consulta.horaTermino) : ahora,
        updatedAt: ahora,
      })
      .where(eq(atenciones.id, consulta.id));

    await this.webhooks.emitir(consulta.codPlan, "atencion.derivada", { origen: consulta, nueva });
    if (nueva.abogadoAsignadoId) {
      await this.notif.crear({
        codPlan: consulta.codPlan,
        usuarioId: nueva.abogadoAsignadoId,
        severidad: "warn",
        titulo: `Derivada a ${nueva.tipo}: ${nueva.correlativo}`,
        detalle: `Desde ${consulta.correlativo} — ${d.motivo}`,
        accionUrl: `/atenciones/${nueva.id}`,
        metadata: { atencionId: nueva.id, origenId: consulta.id, tipo: nueva.tipo },
      });
    }
    return { derivacion, atencion: nueva };
  }

  async rechazar(id: string, actor: Actor, input: RechazarDerivacion): Promise<Derivacion> {
    const d = await this.pendiente(id);
    if (d.solicitadaPorId === actor.id) throw new ForbiddenException("Quien solicitó la derivación no puede resolverla");
    const consulta = await this.atencionesSrv.obtener(d.consultaId);
    const [row] = await this.db
      .update(derivaciones)
      .set({ estado: "Rechazada", resueltaPorId: actor.id, observacion: input.observacion, resueltaAt: new Date() })
      .where(and(eq(derivaciones.id, id), eq(derivaciones.estado, "Solicitada")))
      .returning();
    if (!row) throw new ConflictException("La derivación ya fue resuelta");
    await this.notif.crear({
      codPlan: consulta.codPlan,
      usuarioId: d.solicitadaPorId,
      severidad: "info",
      titulo: `Derivación rechazada: ${consulta.correlativo}`,
      detalle: input.observacion,
      accionUrl: `/atenciones/${consulta.id}`,
      metadata: { derivacionId: id },
    });
    return row;
  }
}
