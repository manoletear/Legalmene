import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, isNotNull, lt } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { gestiones, NuevaGestion, Gestion } from "../../db/schema/gestiones";
import { atenciones } from "../../db/schema/atenciones";
import { usuarios } from "../../db/schema/usuarios";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import type { CreateGestion, CompletarGestion } from "@legalmene/shared";

export interface FiltroGestiones {
  page?: number;
  pageSize?: number;
  estado?: "Pendiente" | "Completada" | "Vencida" | "Cancelada";
  tipo?: string;
  responsableId?: string;
  soloVencidas?: boolean;
}

@Injectable()
export class GestionesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
  ) {}

  async listarPorAtencion(codPlan: string, atencionId: string): Promise<Gestion[]> {
    await this.assertAtencionEnPlan(codPlan, atencionId);
    return this.db
      .select()
      .from(gestiones)
      .where(eq(gestiones.atencionId, atencionId))
      .orderBy(desc(gestiones.createdAt));
  }

  // Listado global per tenant (join con atenciones para filtrar codPlan).
  async listarPorPlan(codPlan: string, filtro: FiltroGestiones) {
    const ahora = new Date();
    const page = filtro.page ?? 1;
    const pageSize = Math.min(filtro.pageSize ?? 50, 200);
    const where = and(
      eq(atenciones.codPlan, codPlan),
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
          atencionMateria: atenciones.materia,
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

  async crear(codPlan: string, input: CreateGestion): Promise<Gestion> {
    await this.assertAtencionEnPlan(codPlan, input.atencionId);
    const payload: NuevaGestion = {
      atencionId: input.atencionId,
      tipo: input.tipo,
      estado: input.estado ?? "Pendiente",
      titulo: input.titulo,
      detalle: input.detalle ?? null,
      responsableId: input.responsableId,
      fechaProgramada: input.fechaProgramada ? new Date(input.fechaProgramada) : null,
      fechaCompromiso: input.fechaCompromiso ? new Date(input.fechaCompromiso) : null,
      documentosIds: input.documentosIds ?? [],
    };
    const [row] = await this.db.insert(gestiones).values(payload).returning();
    await this.db
      .update(atenciones)
      .set({ fechaUltimaGestion: new Date(), estado: "EnGestion", updatedAt: new Date() })
      .where(eq(atenciones.id, input.atencionId));
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
    return row;
  }

  async completar(codPlan: string, gestionId: string, input: CompletarGestion): Promise<Gestion> {
    const [row] = await this.db.select().from(gestiones).where(eq(gestiones.id, gestionId));
    if (!row) throw new NotFoundException(`Gestión ${gestionId} no existe`);
    await this.assertAtencionEnPlan(codPlan, row.atencionId);
    const [updated] = await this.db
      .update(gestiones)
      .set({
        estado: "Completada",
        fechaEjecucion: new Date(),
        resultado: input.resultado,
        documentosIds: input.documentosIds ?? row.documentosIds,
        updatedAt: new Date(),
      })
      .where(eq(gestiones.id, gestionId))
      .returning();
    await this.db
      .update(atenciones)
      .set({ fechaUltimaGestion: new Date(), updatedAt: new Date() })
      .where(eq(atenciones.id, row.atencionId));
    return updated;
  }

  private async assertAtencionEnPlan(codPlan: string, atencionId: string) {
    const [a] = await this.db
      .select({ id: atenciones.id })
      .from(atenciones)
      .where(and(eq(atenciones.id, atencionId), eq(atenciones.codPlan, codPlan)));
    if (!a) throw new NotFoundException(`Atención ${atencionId} no existe en plan ${codPlan}`);
  }
}
