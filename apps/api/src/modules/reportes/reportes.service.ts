import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, count, eq, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import {
  CAMPOS_INFORME_ATENCIONES,
  ESTADOS_TERMINALES,
  type CampoInformeAtencion,
  type FilaController,
  type FilaReporteCanal,
  type FilaReportePlan,
  type InformeAtenciones,
  type Periodo,
  type SerieAfiliadosMes,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { fechaChile, rangoFechas } from "../../common/busqueda/criterios";
import { atenciones } from "../../db/schema/atenciones";
import { planesAfiliado } from "../../db/schema/afiliados";
import { canales, planes } from "../../db/schema/planes";
import { gestiones } from "../../db/schema/gestiones";
import { comites, participantesComite } from "../../db/schema/comites";
import { perfiles, usuarios } from "../../db/schema/usuarios";
import { filasAtencionDetalle, type FilaAtencionDetalle } from "../exports/exports.service";
import { libroXlsx, type ColumnaXlsx, type HojaGenerica } from "../exports/xlsx";
import { conteoVacio, mesesDelPeriodo, sumar, tasaUso } from "./calculo";

const MAX_MESES = 36;

export interface FiltroController {
  desde?: string;
  hasta?: string;
  perfilId?: string;
  jefeId?: string;
  codPlan?: string;
  canalId?: string;
}

const NOMBRE_TIPO: Record<string, string> = {
  Consulta: "Consultas",
  Asesoria: "Asesorías",
  Juicio: "Juicios",
  PosesionEfectiva: "Posesiones efectivas",
};

@Injectable()
export class ReportesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // RUT–Plan vigente en algún día del período: inicio ≤ hasta y (sin término o término ≥ desde).
  private vigenteEnPeriodo(p: Periodo): SQL {
    return sql`${planesAfiliado.fechaInicio} <= ${p.hasta}::date and (${planesAfiliado.fechaTermino} is null or ${planesAfiliado.fechaTermino} >= ${p.desde}::date)`;
  }

  // La atención cae dentro de la vigencia de esa relación RUT–Plan (Anexo §XII "Etapa Consultas").
  private dentroDeVigencia(): SQL {
    return sql`${fechaChile(atenciones.fechaApertura)} between ${planesAfiliado.fechaInicio} and coalesce(${planesAfiliado.fechaTermino}, 'infinity'::date)`;
  }

  private async catalogoPlanes() {
    return this.db
      .select({ codPlan: planes.codPlan, nombre: planes.nombre, canalId: planes.canalId, canal: canales.nombre })
      .from(planes)
      .leftJoin(canales, eq(canales.id, planes.canalId));
  }

  // Reporte por plan (Anexo §XII): consultas de la nómina del plan dentro de la vigencia de cada
  // RUT (sin importar el plan con que se registró), y asesorías/juicios/posesiones registradas
  // bajo el plan. Acotado a las atenciones que el usuario puede ver.
  async porPlan(p: Periodo, codPlan?: string): Promise<FilaReportePlan[]> {
    const enPeriodo = rangoFechas(atenciones.fechaApertura, p.desde, p.hasta);
    const [catalogo, afiliadosRows, consultasRows, otrasRows] = await Promise.all([
      this.catalogoPlanes(),
      this.db
        .select({ codPlan: planesAfiliado.codPlan, n: sql<number>`count(distinct ${planesAfiliado.afiliadoId})` })
        .from(planesAfiliado)
        .where(and(this.vigenteEnPeriodo(p), codPlan ? eq(planesAfiliado.codPlan, codPlan) : undefined))
        .groupBy(planesAfiliado.codPlan),
      this.db
        .select({ codPlan: planesAfiliado.codPlan, n: sql<number>`count(distinct ${atenciones.id})` })
        .from(atenciones)
        .innerJoin(planesAfiliado, and(eq(planesAfiliado.afiliadoId, atenciones.afiliadoId), this.dentroDeVigencia()))
        .where(
          and(
            filtroAtenciones(),
            eq(atenciones.tipo, "Consulta"),
            enPeriodo,
            codPlan ? eq(planesAfiliado.codPlan, codPlan) : undefined,
          ),
        )
        .groupBy(planesAfiliado.codPlan),
      this.db
        .select({ codPlan: atenciones.codPlan, tipo: atenciones.tipo, n: count() })
        .from(atenciones)
        .where(
          and(
            filtroAtenciones(),
            ne(atenciones.tipo, "Consulta"),
            enPeriodo,
            codPlan ? eq(atenciones.codPlan, codPlan) : undefined,
          ),
        )
        .groupBy(atenciones.codPlan, atenciones.tipo),
    ]);

    const filas = new Map<string, FilaReportePlan>();
    const fila = (cod: string) => {
      let f = filas.get(cod);
      if (!f) {
        const plan = catalogo.find((c) => c.codPlan === cod);
        f = { codPlan: cod, nombre: plan?.nombre ?? cod, canal: plan?.canal ?? null, afiliadosVigentes: 0, tasaUso: null, ...conteoVacio() };
        filas.set(cod, f);
      }
      return f;
    };
    if (codPlan) fila(codPlan);
    for (const r of afiliadosRows) fila(r.codPlan).afiliadosVigentes = Number(r.n);
    for (const r of consultasRows) sumar(fila(r.codPlan), "Consulta", Number(r.n));
    for (const r of otrasRows) sumar(fila(r.codPlan), r.tipo, Number(r.n));
    for (const f of filas.values()) f.tasaUso = tasaUso(f.total, f.afiliadosVigentes);
    return [...filas.values()].sort((a, b) => a.codPlan.localeCompare(b.codPlan));
  }

  // Reporte por canal (Anexo §XII): mismas reglas que por plan, sin contar dos veces una atención
  // ni un afiliado que tenga más de un plan del mismo canal.
  async porCanal(p: Periodo, canalId?: string): Promise<FilaReporteCanal[]> {
    const enPeriodo = rangoFechas(atenciones.fechaApertura, p.desde, p.hasta);
    const canalDePlan = (col: SQL | typeof planesAfiliado.codPlan | typeof atenciones.codPlan) =>
      sql`(select pl.canal_id from planes pl where pl.cod_plan = ${col})`;
    const filtroCanal = (col: typeof planesAfiliado.codPlan | typeof atenciones.codPlan) =>
      canalId ? sql`${canalDePlan(col)} = ${canalId}` : undefined;

    const [catalogoCanales, porPlanRows, afiliadosRows, consultasRows, otrasRows] = await Promise.all([
      this.db.select({ id: canales.id, nombre: canales.nombre }).from(canales),
      this.porPlan(p),
      this.db
        .select({ canalId: sql<string | null>`${canalDePlan(planesAfiliado.codPlan)}`, n: sql<number>`count(distinct ${planesAfiliado.afiliadoId})` })
        .from(planesAfiliado)
        .where(and(this.vigenteEnPeriodo(p), filtroCanal(planesAfiliado.codPlan)))
        .groupBy(sql`1`),
      this.db
        .select({ canalId: sql<string | null>`${canalDePlan(planesAfiliado.codPlan)}`, n: sql<number>`count(distinct ${atenciones.id})` })
        .from(atenciones)
        .innerJoin(planesAfiliado, and(eq(planesAfiliado.afiliadoId, atenciones.afiliadoId), this.dentroDeVigencia()))
        .where(and(filtroAtenciones(), eq(atenciones.tipo, "Consulta"), enPeriodo, filtroCanal(planesAfiliado.codPlan)))
        .groupBy(sql`1`),
      this.db
        .select({ canalId: sql<string | null>`${canalDePlan(atenciones.codPlan)}`, tipo: atenciones.tipo, n: count() })
        .from(atenciones)
        .where(and(filtroAtenciones(), ne(atenciones.tipo, "Consulta"), enPeriodo, filtroCanal(atenciones.codPlan)))
        .groupBy(sql`1`, atenciones.tipo),
    ]);

    const catalogoPlanes = await this.catalogoPlanes();
    const filas = new Map<string, FilaReporteCanal>();
    const clave = (id: string | null) => id ?? "sin-canal";
    const fila = (id: string | null) => {
      const k = clave(id);
      let f = filas.get(k);
      if (!f) {
        const nombre = id ? (catalogoCanales.find((c) => c.id === id)?.nombre ?? "Canal") : "Sin canal";
        f = { canalId: id, canal: nombre, afiliadosVigentes: 0, tasaUso: null, planes: [], ...conteoVacio() };
        filas.set(k, f);
      }
      return f;
    };
    if (canalId) fila(canalId);
    for (const r of afiliadosRows) fila(r.canalId).afiliadosVigentes = Number(r.n);
    for (const r of consultasRows) sumar(fila(r.canalId), "Consulta", Number(r.n));
    for (const r of otrasRows) sumar(fila(r.canalId), r.tipo, Number(r.n));
    for (const pl of porPlanRows) {
      const canal = catalogoPlanes.find((c) => c.codPlan === pl.codPlan)?.canalId ?? null;
      if (canalId && canal !== canalId) continue;
      fila(canal).planes.push(pl);
    }
    for (const f of filas.values()) f.tasaUso = tasaUso(f.total, f.afiliadosVigentes);
    return [...filas.values()].sort((a, b) => a.canal.localeCompare(b.canal, "es"));
  }

  // Afiliados activos por plan y mes (Anexo §XII B): RUT con la relación RUT–Plan vigente algún
  // día del mes.
  async afiliadosPorMes(p: Periodo, filtro: { codPlan?: string; canalId?: string } = {}): Promise<SerieAfiliadosMes[]> {
    const meses = mesesDelPeriodo(p.desde, p.hasta);
    if (meses.length > MAX_MESES) throw new BadRequestException(`El período no puede superar ${MAX_MESES} meses`);
    const catalogo = await this.catalogoPlanes();
    const planesFiltrados = catalogo.filter(
      (c) => (!filtro.codPlan || c.codPlan === filtro.codPlan) && (!filtro.canalId || c.canalId === filtro.canalId),
    );
    const codigos = planesFiltrados.map((c) => c.codPlan);
    if (codigos.length === 0) return [];
    const out: SerieAfiliadosMes[] = [];
    for (const m of meses) {
      const rows = await this.db
        .select({ codPlan: planesAfiliado.codPlan, n: sql<number>`count(distinct ${planesAfiliado.afiliadoId})` })
        .from(planesAfiliado)
        .where(and(this.vigenteEnPeriodo({ desde: m.inicio, hasta: m.fin }), inArray(planesAfiliado.codPlan, codigos)))
        .groupBy(planesAfiliado.codPlan);
      for (const pl of planesFiltrados) {
        const r = rows.find((x) => x.codPlan === pl.codPlan);
        out.push({ mes: m.mes, codPlan: pl.codPlan, plan: pl.nombre, canal: pl.canal, activos: Number(r?.n ?? 0) });
      }
    }
    return out;
  }

  // Informe de atenciones (Anexo §XIII): una hoja por tipo con los campos elegidos + "Resumen".
  async informeXlsx(body: InformeAtenciones): Promise<Buffer> {
    const where = and(
      filtroAtenciones(),
      inArray(atenciones.tipo, body.tipos),
      rangoFechas(atenciones.fechaApertura, body.desde, body.hasta),
      body.codPlan ? eq(atenciones.codPlan, body.codPlan) : undefined,
      body.canalId ? sql`${atenciones.codPlan} in (select p.cod_plan from planes p where p.canal_id = ${body.canalId})` : undefined,
      body.abogadoId ? eq(atenciones.abogadoAsignadoId, body.abogadoId) : undefined,
    );
    const filas = await filasAtencionDetalle(this.db, where);
    const valorCampo = (r: FilaAtencionDetalle, c: CampoInformeAtencion): string | number => {
      const fecha = (d: Date | null) => (d ? new Date(d).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }) : "");
      switch (c) {
        case "plan":
          return r.plan ?? r.codPlan;
        case "fechaApertura":
          return fecha(r.fechaApertura);
        case "fechaCierre":
          return fecha(r.fechaCierre);
        default:
          return (r[c as keyof FilaAtencionDetalle] as string | null) ?? "";
      }
    };
    const columnas: ColumnaXlsx<FilaAtencionDetalle>[] = body.campos.map((c) => ({
      titulo: CAMPOS_INFORME_ATENCIONES[c],
      valor: (r) => valorCampo(r, c),
      ancho: c === "asunto" || c === "afiliado" ? 28 : 16,
    }));
    const hojas: HojaGenerica[] = [];
    const resumenPorPlan = new Map<string, Record<string, number>>();
    for (const r of filas) {
      const plan = r.plan ?? r.codPlan;
      const fila = resumenPorPlan.get(plan) ?? {};
      fila[r.tipo] = (fila[r.tipo] ?? 0) + 1;
      resumenPorPlan.set(plan, fila);
    }
    const resumen = [...resumenPorPlan.entries()].map(([plan, porTipo]) => ({ plan, porTipo }));
    hojas.push({
      nombre: "Resumen",
      columnas: [
        { titulo: "Plan", valor: (r: (typeof resumen)[number]) => r.plan, ancho: 26 },
        ...body.tipos.map((t) => ({ titulo: NOMBRE_TIPO[t] ?? t, valor: (r: (typeof resumen)[number]) => r.porTipo[t] ?? 0 })),
        { titulo: "Total", valor: (r: (typeof resumen)[number]) => Object.values(r.porTipo).reduce((a, b) => a + b, 0) },
      ],
      filas: resumen,
    });
    for (const t of body.tipos) {
      hojas.push({ nombre: NOMBRE_TIPO[t] ?? t, columnas, filas: filas.filter((r) => r.tipo === t) });
    }
    return libroXlsx(hojas);
  }

  // Controller de usuarios (Anexo §XIII / Tooxs 9.16): carga por abogado dentro del alcance.
  async controller(f: FiltroController): Promise<FilaController[]> {
    const condAtencion = and(
      filtroAtenciones(),
      f.codPlan ? eq(atenciones.codPlan, f.codPlan) : undefined,
      f.canalId ? sql`${atenciones.codPlan} in (select p.cod_plan from planes p where p.canal_id = ${f.canalId})` : undefined,
      rangoFechas(atenciones.fechaApertura, f.desde, f.hasta),
    );
    const [porEstado, porGestiones, porComites] = await Promise.all([
      this.db
        .select({ usuarioId: atenciones.abogadoAsignadoId, estado: atenciones.estado, n: count() })
        .from(atenciones)
        .where(and(condAtencion, isNotNull(atenciones.abogadoAsignadoId)))
        .groupBy(atenciones.abogadoAsignadoId, atenciones.estado),
      this.db
        .select({
          usuarioId: gestiones.responsableId,
          pendientes: sql<number>`count(*) filter (where ${gestiones.estado} = 'Pendiente')`,
          vencidas: sql<number>`count(*) filter (where ${gestiones.estado} = 'Pendiente' and ${gestiones.fechaCompromiso} < now())`,
        })
        .from(gestiones)
        .innerJoin(atenciones, eq(atenciones.id, gestiones.atencionId))
        .where(condAtencion)
        .groupBy(gestiones.responsableId),
      this.db
        .select({ usuarioId: participantesComite.usuarioId, n: sql<number>`count(distinct ${comites.id})` })
        .from(participantesComite)
        .innerJoin(comites, eq(comites.id, participantesComite.comiteId))
        .innerJoin(atenciones, eq(atenciones.id, comites.atencionId))
        .where(and(condAtencion, inArray(comites.estado, ["Convocado", "EnSesion"])))
        .groupBy(participantesComite.usuarioId),
    ]);
    const ids = new Set<string>();
    for (const r of porEstado) if (r.usuarioId) ids.add(r.usuarioId);
    for (const r of porGestiones) ids.add(r.usuarioId);
    for (const r of porComites) ids.add(r.usuarioId);
    if (ids.size === 0) return [];
    const usuariosRows = await this.db
      .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, perfil: perfiles.nombre })
      .from(usuarios)
      .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
      .where(
        and(
          inArray(usuarios.id, [...ids]),
          f.perfilId ? eq(usuarios.perfilId, f.perfilId) : undefined,
          f.jefeId ? eq(usuarios.jefeId, f.jefeId) : undefined,
        ),
      );
    const terminales = new Set<string>(ESTADOS_TERMINALES);
    return usuariosRows
      .map((u) => {
        const estados = porEstado.filter((r) => r.usuarioId === u.id);
        const porEstadoMap: Record<string, number> = {};
        for (const e of estados) porEstadoMap[e.estado] = Number(e.n);
        const asignadas = estados.reduce((a, e) => a + Number(e.n), 0);
        const g = porGestiones.find((r) => r.usuarioId === u.id);
        return {
          usuarioId: u.id,
          nombre: u.nombre,
          email: u.email,
          perfil: u.perfil,
          asignadas,
          pendientes: estados.filter((e) => !terminales.has(e.estado)).reduce((a, e) => a + Number(e.n), 0),
          terminadas: porEstadoMap["Terminada"] ?? 0,
          porEstado: porEstadoMap,
          gestionesPendientes: Number(g?.pendientes ?? 0),
          gestionesVencidas: Number(g?.vencidas ?? 0),
          comitesAbiertos: Number(porComites.find((r) => r.usuarioId === u.id)?.n ?? 0),
        };
      })
      .sort((a, b) => b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre, "es"));
  }

  async controllerXlsx(f: FiltroController): Promise<Buffer> {
    const filas = await this.controller(f);
    return libroXlsx([
      {
        nombre: "Controller",
        columnas: [
          { titulo: "Usuario", valor: (r: FilaController) => r.nombre, ancho: 26 },
          { titulo: "Correo", valor: (r: FilaController) => r.email, ancho: 28 },
          { titulo: "Perfil", valor: (r: FilaController) => r.perfil, ancho: 22 },
          { titulo: "Asignadas", valor: (r: FilaController) => r.asignadas },
          { titulo: "Pendientes", valor: (r: FilaController) => r.pendientes },
          { titulo: "Terminadas", valor: (r: FilaController) => r.terminadas },
          { titulo: "Gestiones pendientes", valor: (r: FilaController) => r.gestionesPendientes },
          { titulo: "Gestiones vencidas", valor: (r: FilaController) => r.gestionesVencidas },
          { titulo: "Comités abiertos", valor: (r: FilaController) => r.comitesAbiertos },
          {
            titulo: "Por estado",
            valor: (r: FilaController) =>
              Object.entries(r.porEstado)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", "),
            ancho: 40,
          },
        ],
        filas,
      },
    ]);
  }

  async xlsxPorPlan(p: Periodo, codPlan?: string): Promise<Buffer> {
    const filas = await this.porPlan(p, codPlan);
    return libroXlsx([hojaPlanes("Reporte por plan", filas)]);
  }

  async xlsxPorCanal(p: Periodo, canalId?: string): Promise<Buffer> {
    const canalesFilas = await this.porCanal(p, canalId);
    const resumen = canalesFilas.map((c) => ({ ...c, codPlan: "", nombre: c.canal, canal: c.canal }));
    return libroXlsx([
      hojaPlanes("Resumen por canal", resumen, true),
      hojaPlanes("Detalle por plan", canalesFilas.flatMap((c) => c.planes)),
    ]);
  }

  async xlsxAfiliadosMes(p: Periodo, filtro: { codPlan?: string; canalId?: string }): Promise<Buffer> {
    const serie = await this.afiliadosPorMes(p, filtro);
    return libroXlsx([
      {
        nombre: "Afiliados activos",
        columnas: [
          { titulo: "Mes", valor: (r: SerieAfiliadosMes) => r.mes },
          { titulo: "Canal", valor: (r: SerieAfiliadosMes) => r.canal ?? "Sin canal" },
          { titulo: "Cód. plan", valor: (r: SerieAfiliadosMes) => r.codPlan },
          { titulo: "Plan", valor: (r: SerieAfiliadosMes) => r.plan, ancho: 26 },
          { titulo: "Afiliados activos", valor: (r: SerieAfiliadosMes) => r.activos },
        ],
        filas: serie,
      },
    ]);
  }
}

function hojaPlanes(nombre: string, filas: FilaReportePlan[], esCanal = false): HojaGenerica {
  const pct = (t: number | null) => (t == null ? "" : `${(t * 100).toFixed(2).replace(".", ",")} %`);
  return {
    nombre,
    columnas: [
      ...(esCanal
        ? [{ titulo: "Canal", valor: (r: FilaReportePlan) => r.nombre, ancho: 24 }]
        : [
            { titulo: "Cód. plan", valor: (r: FilaReportePlan) => r.codPlan },
            { titulo: "Plan", valor: (r: FilaReportePlan) => r.nombre, ancho: 26 },
            { titulo: "Canal", valor: (r: FilaReportePlan) => r.canal ?? "Sin canal" },
          ]),
      { titulo: "Afiliados vigentes", valor: (r: FilaReportePlan) => r.afiliadosVigentes },
      { titulo: "Consultas", valor: (r: FilaReportePlan) => r.consultas },
      { titulo: "Asesorías", valor: (r: FilaReportePlan) => r.asesorias },
      { titulo: "Juicios", valor: (r: FilaReportePlan) => r.juicios },
      { titulo: "Posesiones efectivas", valor: (r: FilaReportePlan) => r.posesiones },
      { titulo: "Total atenciones", valor: (r: FilaReportePlan) => r.total },
      { titulo: "Tasa de uso", valor: (r: FilaReportePlan) => pct(r.tasaUso) },
    ],
    filas,
  };
}

