import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { gestiones } from "../../db/schema/gestiones";
import { comites } from "../../db/schema/comites";

export interface DashboardKpis {
  codPlan: string;
  afiliados: { total: number; activos: number; eliminados: number };
  atenciones: {
    total: number;
    abiertas: number;
    enGestion: number;
    enComite: number;
    cerradas: number;
    porTipo: { Consulta: number; Asesoria: number; Juicio: number };
    creadasHoy: number;
    creadasUltimos30Dias: number;
  };
  gestiones: { pendientes: number; vencidas: number };
  comites: { abiertos: number };
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async kpis(codPlan: string): Promise<DashboardKpis> {
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
      .where(eq(afiliados.codPlan, codPlan));

    const [at] = await this.db
      .select({
        total: count(),
        abiertas: sql<number>`count(*) filter (where ${atenciones.estado} = 'Abierta')`,
        enGestion: sql<number>`count(*) filter (where ${atenciones.estado} = 'EnGestion')`,
        enComite: sql<number>`count(*) filter (where ${atenciones.estado} = 'EnComite')`,
        cerradas: sql<number>`count(*) filter (where ${atenciones.estado} = 'Cerrada')`,
        consultas: sql<number>`count(*) filter (where ${atenciones.tipo} = 'Consulta')`,
        asesorias: sql<number>`count(*) filter (where ${atenciones.tipo} = 'Asesoria')`,
        juicios: sql<number>`count(*) filter (where ${atenciones.tipo} = 'Juicio')`,
        creadasHoy: sql<number>`count(*) filter (where ${atenciones.fechaApertura} >= ${inicioHoy})`,
        creadas30: sql<number>`count(*) filter (where ${atenciones.fechaApertura} >= ${hace30})`,
      })
      .from(atenciones)
      .where(eq(atenciones.codPlan, codPlan));

    // Gestiones requieren join con atenciones para filtrar por codPlan.
    const [g] = await this.db
      .select({
        pendientes: sql<number>`count(*) filter (where ${gestiones.estado} = 'Pendiente')`,
        vencidas: sql<number>`count(*) filter (where ${gestiones.estado} = 'Pendiente' and ${gestiones.fechaCompromiso} < ${ahora})`,
      })
      .from(gestiones)
      .innerJoin(atenciones, eq(gestiones.atencionId, atenciones.id))
      .where(eq(atenciones.codPlan, codPlan));

    const [c] = await this.db
      .select({
        abiertos: sql<number>`count(*) filter (where ${comites.estado} in ('Convocado','EnSesion'))`,
      })
      .from(comites)
      .innerJoin(atenciones, eq(comites.atencionId, atenciones.id))
      .where(eq(atenciones.codPlan, codPlan));

    return {
      codPlan,
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
        cerradas: Number(at?.cerradas ?? 0),
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
    };
  }

  // Serie temporal: atenciones creadas por día en los últimos N días.
  async timelineAtenciones(codPlan: string, dias = 30): Promise<{ fecha: string; total: number }[]> {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    desde.setUTCHours(0, 0, 0, 0);
    const rows = await this.db
      .select({
        fecha: sql<string>`to_char(${atenciones.fechaApertura}::date, 'YYYY-MM-DD')`,
        total: count(),
      })
      .from(atenciones)
      .where(and(eq(atenciones.codPlan, codPlan), gte(atenciones.fechaApertura, desde)))
      .groupBy(sql`${atenciones.fechaApertura}::date`)
      .orderBy(sql`${atenciones.fechaApertura}::date`);
    return rows.map((r) => ({ fecha: r.fecha, total: Number(r.total) }));
  }
}
