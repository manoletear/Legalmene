import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones } from "../../db/schema/atenciones";
import { usuarios } from "../../db/schema/usuarios";
import {
  provisiones,
  provisionMovimientos,
  Provision,
  ProvisionMovimiento,
} from "../../db/schema/provisiones";
import type {
  EstadoProvision,
  RegistrarMovimiento,
  ResumenProvisionAtencion,
  SolicitarProvision,
} from "@legalmene/shared";

export interface FiltroProvisiones {
  page?: number;
  pageSize?: number;
  estado?: EstadoProvision;
  codPlan?: string;
}

const ESTADOS_ATENCION_CERRADA = ["Cerrada", "Archivada"];
const clp = (n: number) => "$" + n.toLocaleString("es-CL");

// Neto utilizado de una provisión: gastos menos reintegros.
const utilizadoSql = sql<number>`coalesce(sum(case when ${provisionMovimientos.tipo} = 'Gasto' then ${provisionMovimientos.monto} else -${provisionMovimientos.monto} end), 0)`;

@Injectable()
export class ProvisionesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async listar(filtro: FiltroProvisiones = {}) {
    const page = filtro.page ?? 1;
    const pageSize = Math.min(filtro.pageSize ?? 50, 200);
    const where = and(
      filtro.codPlan ? eq(atenciones.codPlan, filtro.codPlan) : undefined,
      filtro.estado ? eq(provisiones.estado, filtro.estado) : undefined,
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: provisiones.id,
          atencionId: provisiones.atencionId,
          correlativo: atenciones.correlativo,
          asunto: atenciones.asunto,
          monto: provisiones.monto,
          motivo: provisiones.motivo,
          estado: provisiones.estado,
          solicitadaPorEmail: usuarios.email,
          fechaSolicitud: provisiones.fechaSolicitud,
          fechaResolucion: provisiones.fechaResolucion,
          observacionResolucion: provisiones.observacionResolucion,
        })
        .from(provisiones)
        .innerJoin(atenciones, eq(provisiones.atencionId, atenciones.id))
        .innerJoin(usuarios, eq(provisiones.solicitadaPorId, usuarios.id))
        .where(where)
        .orderBy(desc(provisiones.fechaSolicitud))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ value: count() })
        .from(provisiones)
        .innerJoin(atenciones, eq(provisiones.atencionId, atenciones.id))
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

  async listarPorAtencion(atencionId: string) {
    await this.assertAtencion(atencionId);
    const filas = await this.db
      .select()
      .from(provisiones)
      .where(eq(provisiones.atencionId, atencionId))
      .orderBy(desc(provisiones.fechaSolicitud));
    return { data: filas, resumen: await this.resumenAtencion(atencionId) };
  }

  async resumenAtencion(atencionId: string): Promise<ResumenProvisionAtencion> {
    const [totales] = await this.db
      .select({
        aprobado: sql<number>`coalesce(sum(${provisiones.monto}) filter (where ${provisiones.estado} = 'Aprobada'), 0)`,
        pendiente: sql<number>`coalesce(sum(${provisiones.monto}) filter (where ${provisiones.estado} = 'Solicitada'), 0)`,
      })
      .from(provisiones)
      .where(eq(provisiones.atencionId, atencionId));

    const [mov] = await this.db
      .select({ utilizado: utilizadoSql })
      .from(provisionMovimientos)
      .innerJoin(provisiones, eq(provisionMovimientos.provisionId, provisiones.id))
      .where(eq(provisiones.atencionId, atencionId));

    const aprobado = Number(totales?.aprobado ?? 0);
    const utilizado = Number(mov?.utilizado ?? 0);
    return {
      aprobado,
      utilizado,
      disponible: aprobado - utilizado,
      pendiente: Number(totales?.pendiente ?? 0),
    };
  }

  async solicitar(
    atencionId: string,
    usuarioId: string,
    input: SolicitarProvision,
  ): Promise<Provision> {
    const atencion = await this.assertAtencion(atencionId);
    if (ESTADOS_ATENCION_CERRADA.includes(atencion.estado)) {
      throw new BadRequestException(`No se pueden solicitar provisiones en un caso ${atencion.estado}`);
    }
    const [row] = await this.db
      .insert(provisiones)
      .values({ atencionId, monto: input.monto, motivo: input.motivo, solicitadaPorId: usuarioId })
      .returning();
    return row;
  }

  async resolver(
    id: string,
    usuarioId: string,
    decision: "Aprobada" | "Rechazada",
    observacion?: string,
  ): Promise<Provision> {
    // El filtro estado='Solicitada' en el UPDATE evita resolver dos veces bajo concurrencia.
    const [row] = await this.db
      .update(provisiones)
      .set({
        estado: decision,
        resueltaPorId: usuarioId,
        observacionResolucion: observacion ?? null,
        fechaResolucion: new Date(),
      })
      .where(
        and(
          eq(provisiones.id, id),
          eq(provisiones.estado, "Solicitada"),
        ),
      )
      .returning();
    if (row) return row;

    const actual = await this.obtener(id);
    throw new ConflictException(`La provisión ya fue resuelta (${actual.estado})`);
  }

  async listarMovimientos(provisionId: string): Promise<ProvisionMovimiento[]> {
    await this.obtener(provisionId);
    return this.db
      .select()
      .from(provisionMovimientos)
      .where(eq(provisionMovimientos.provisionId, provisionId))
      .orderBy(desc(provisionMovimientos.fecha));
  }

  async registrarMovimiento(
    provisionId: string,
    usuarioId: string,
    input: RegistrarMovimiento,
  ): Promise<ProvisionMovimiento> {
    return this.db.transaction(async (tx) => {
      // Bloquea la provisión para serializar movimientos concurrentes sobre el mismo saldo.
      const [prov] = await tx
        .select()
        .from(provisiones)
        .where(eq(provisiones.id, provisionId))
        .for("update");
      if (!prov) throw new NotFoundException(`Provisión ${provisionId} no existe`);
      if (prov.estado !== "Aprobada") {
        throw new BadRequestException("Solo se registran movimientos en provisiones aprobadas");
      }

      const [{ utilizado }] = await tx
        .select({ utilizado: utilizadoSql })
        .from(provisionMovimientos)
        .where(eq(provisionMovimientos.provisionId, provisionId));
      const usado = Number(utilizado);

      if (input.tipo === "Gasto" && input.monto > prov.monto - usado) {
        throw new BadRequestException(
          `El gasto supera el saldo disponible de la provisión (${clp(prov.monto - usado)})`,
        );
      }
      if (input.tipo === "Reintegro" && input.monto > usado) {
        throw new BadRequestException(`El reintegro supera lo utilizado (${clp(usado)})`);
      }

      const [mov] = await tx
        .insert(provisionMovimientos)
        .values({ provisionId, tipo: input.tipo, monto: input.monto, glosa: input.glosa, registradoPorId: usuarioId })
        .returning();
      return mov;
    });
  }

  private async obtener(id: string): Promise<Provision> {
    const [row] = await this.db
      .select()
      .from(provisiones)
      .where(eq(provisiones.id, id));
    if (!row) throw new NotFoundException(`Provisión ${id} no existe`);
    return row;
  }

  private async assertAtencion(atencionId: string) {
    const [row] = await this.db
      .select({ id: atenciones.id, estado: atenciones.estado })
      .from(atenciones)
      .where(eq(atenciones.id, atencionId));
    if (!row) throw new NotFoundException(`Atención ${atencionId} no existe`);
    return row;
  }
}
