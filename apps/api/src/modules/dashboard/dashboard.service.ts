import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, exists, gte, inArray, sql } from "drizzle-orm";
import { ESTADOS_ACTIVOS, ESTADOS_TERMINALES, EstadoAtencionEnum, type EstadoAtencion } from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados, planesAfiliado } from "../../db/schema/afiliados";
import { gestiones } from "../../db/schema/gestiones";
import { comites } from "../../db/schema/comites";
import { usuarios } from "../../db/schema/usuarios";
import { provisiones } from "../../db/schema/provisiones";
import { competencias } from "../../db/schema/maestros";

const porPlan = (codPlan?: string) => (codPlan ? eq(atenciones.codPlan, codPlan) : undefined);
const ESPERAS: EstadoAtencion[] = ["EnEsperaAntecedentes", "EnEsperaArancel", "EnEsperaProvision"];

export interface DashboardKpis {
  // null = todos los planes.
  codPlan: string | null;
  afiliados: { total: number; activos: number; eliminados: number };
  atenciones: {
    total: number;
    // Activas = en cualquier estado no terminal.
    abiertas: number;
    enGestion: number;
    enComite: number;
    enEspera: number;
    cerradas: number;
    porEstado: Record<EstadoAtencion, number>;
    porTipo: { Consulta: number; Asesoria: number; Juicio: number };
    creadasHoy: number;
    creadasUltimos30Dias: number;
  };
  gestiones: { pendientes: number; vencidas: number };
  comites: { abiertos: number };
  provisiones: { pendientes: number; montoPendiente: number };
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async kpis(codPlan?: string): Promise<DashboardKpis> {
    const inicioHoy = new Date();
    inicioHoy.setUTCHours(0, 0, 0, 0);
    const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ahora = new Date();

    // Una sola pasada por tabla con agregados condicionales para minimizar roundtrips.
    const [afi] = await this.db
      .select({
        total: count(),
        activos: sql<number>`count(*) filter (where ${afiliados.vigencia} = 'Activo')`,
        eliminados: sql<number>`count(*) filter (where ${afiliados.vigencia} = 'Eliminado')`,
      })
      .from(afiliados)
      .where(
        codPlan
          ? exists(
              this.db
                .select({ id: planesAfiliado.id })
                .from(planesAfiliado)
                .where(and(eq(planesAfiliado.afiliadoId, afiliados.id), eq(planesAfiliado.codPlan, codPlan))),
            )
          : undefined,
      );

    const [at] = await this.db
      .select({
        total: count(),
        abiertas: sql<number>`count(*) filter (where ${inArray(atenciones.estado, [...ESTADOS_ACTIVOS])})`,
        enGestion: sql<number>`count(*) filter (where ${atenciones.estado} = 'EnGestion')`,
        enComite: sql<number>`count(*) filter (where ${atenciones.estado} = 'EnComite')`,
        enEspera: sql<number>`count(*) filter (where ${inArray(atenciones.estado, ESPERAS)})`,
        cerradas: sql<number>`count(*) filter (where ${inArray(atenciones.estado, [...ESTADOS_TERMINALES])})`,
        consultas: sql<number>`count(*) filter (where ${atenciones.tipo} = 'Consulta')`,
        asesorias: sql<number>`count(*) filter (where ${atenciones.tipo} = 'Asesoria')`,
        juicios: sql<number>`count(*) filter (where ${atenciones.tipo} = 'Juicio')`,
        creadasHoy: sql<number>`count(*) filter (where ${atenciones.fechaApertura} >= ${inicioHoy})`,
        creadas30: sql<number>`count(*) filter (where ${atenciones.fechaApertura} >= ${hace30})`,
      })
      .from(atenciones)
      .where(porPlan(codPlan));

    const filasEstado = await this.db
      .select({ estado: atenciones.estado, total: count() })
      .from(atenciones)
      .where(porPlan(codPlan))
      .groupBy(atenciones.estado);
    const porEstado = Object.fromEntries(EstadoAtencionEnum.options.map((e) => [e, 0])) as Record<EstadoAtencion, number>;
    for (const f of filasEstado) porEstado[f.estado] = Number(f.total);

    // Gestiones y comités se filtran por el plan de su atención.
    const [g] = await this.db
      .select({
        pendientes: sql<number>`count(*) filter (where ${gestiones.estado} = 'Pendiente')`,
        vencidas: sql<number>`count(*) filter (where ${gestiones.estado} = 'Pendiente' and ${gestiones.fechaCompromiso} < ${ahora})`,
      })
      .from(gestiones)
      .innerJoin(atenciones, eq(gestiones.atencionId, atenciones.id))
      .where(porPlan(codPlan));

    const [c] = await this.db
      .select({
        abiertos: sql<number>`count(*) filter (where ${comites.estado} in ('Convocado','EnSesion'))`,
      })
      .from(comites)
      .innerJoin(atenciones, eq(comites.atencionId, atenciones.id))
      .where(porPlan(codPlan));

    const [p] = await this.db
      .select({
        pendientes: count(),
        montoPendiente: sql<number>`coalesce(sum(${provisiones.monto}), 0)`,
      })
      .from(provisiones)
      .innerJoin(atenciones, eq(provisiones.atencionId, atenciones.id))
      // Pendientes = esperando pago del cliente o autorización de entrega.
      .where(and(porPlan(codPlan), inArray(provisiones.estado, ["Solicitada", "EnAprobacion"])));

    return {
      codPlan: codPlan ?? null,
      afiliados: {
        total: Number(afi?.total ?? 0),
        activos: Number(afi?.activos ?? 0),
        eliminados: Number(afi?.eliminados ?? 0),
      },
      atenciones: {
        total: Number(at?.total ?? 0),
        abiertas: Number(at?.abiertas ?? 0),
        enGestion: Number(at?.enGestion ?? 0),
        enComite: Number(at?.enComite ?? 0),
        enEspera: Number(at?.enEspera ?? 0),
        cerradas: Number(at?.cerradas ?? 0),
        porEstado,
        porTipo: {
          Consulta: Number(at?.consultas ?? 0),
          Asesoria: Number(at?.asesorias ?? 0),
          Juicio: Number(at?.juicios ?? 0),
        },
        creadasHoy: Number(at?.creadasHoy ?? 0),
        creadasUltimos30Dias: Number(at?.creadas30 ?? 0),
      },
      gestiones: {
        pendientes: Number(g?.pendientes ?? 0),
        vencidas: Number(g?.vencidas ?? 0),
      },
      comites: {
        abiertos: Number(c?.abiertos ?? 0),
      },
      provisiones: {
        pendientes: Number(p?.pendientes ?? 0),
        montoPendiente: Number(p?.montoPendiente ?? 0),
      },
    };
  }

  // Serie temporal: atenciones creadas por día en los últimos N días.
  async timelineAtenciones(codPlan: string | undefined, dias = 30): Promise<{ fecha: string; total: number }[]> {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    desde.setUTCHours(0, 0, 0, 0);
    const rows = await this.db
      .select({
        fecha: sql<string>`to_char(${atenciones.fechaApertura}::date, 'YYYY-MM-DD')`,
        total: count(),
      })
      .from(atenciones)
      .where(and(porPlan(codPlan), gte(atenciones.fechaApertura, desde)))
      .groupBy(sql`${atenciones.fechaApertura}::date`)
      .orderBy(sql`${atenciones.fechaApertura}::date`);
    return rows.map((r) => ({ fecha: r.fecha, total: Number(r.total) }));
  }

  // Distribución por competencia (Civil/Penal/Laboral/...) — donut chart.
  async porCompetencia(codPlan?: string): Promise<{ competencia: string; total: number }[]> {
    const rows = await this.db
      .select({ competencia: competencias.nombre, total: count() })
      .from(atenciones)
      .innerJoin(competencias, eq(competencias.id, atenciones.competenciaId))
      .where(porPlan(codPlan))
      .groupBy(competencias.nombre)
      .orderBy(sql`count(*) desc`);
    return rows.map((r) => ({ competencia: r.competencia, total: Number(r.total) }));
  }

  // Top abogados por atenciones activas (estados no terminales).
  // Identifica cuellos de botella de carga.
  async cargaPorAbogado(
    codPlan: string | undefined,
    limit = 10,
  ): Promise<{ abogadoId: string; email: string; activas: number; total: number }[]> {
    const rows = await this.db
      .select({
        abogadoId: atenciones.abogadoAsignadoId,
        email: usuarios.email,
        activas: sql<number>`count(*) filter (where ${inArray(atenciones.estado, [...ESTADOS_ACTIVOS])})`,
        total: count(),
      })
      .from(atenciones)
      .innerJoin(usuarios, eq(atenciones.abogadoAsignadoId, usuarios.id))
      .where(porPlan(codPlan))
      .groupBy(atenciones.abogadoAsignadoId, usuarios.email)
      .orderBy(sql`count(*) filter (where ${inArray(atenciones.estado, [...ESTADOS_ACTIVOS])}) desc`)
      .limit(limit);
    return rows.map((r) => ({
      abogadoId: r.abogadoId ?? "",
      email: r.email,
      activas: Number(r.activas),
      total: Number(r.total),
    }));
  }

  // Atenciones creadas por mes (últimos N meses). Tendencia macro.
  async porMes(codPlan: string | undefined, meses = 12): Promise<{ mes: string; total: number }[]> {
    const desde = new Date();
    desde.setUTCDate(1);
    desde.setUTCHours(0, 0, 0, 0);
    desde.setUTCMonth(desde.getUTCMonth() - meses + 1);
    const rows = await this.db
      .select({
        mes: sql<string>`to_char(date_trunc('month', ${atenciones.fechaApertura}), 'YYYY-MM')`,
        total: count(),
      })
      .from(atenciones)
      .where(and(porPlan(codPlan), gte(atenciones.fechaApertura, desde)))
      .groupBy(sql`date_trunc('month', ${atenciones.fechaApertura})`)
      .orderBy(sql`date_trunc('month', ${atenciones.fechaApertura})`);
    return rows.map((r) => ({ mes: r.mes, total: Number(r.total) }));
  }
}
