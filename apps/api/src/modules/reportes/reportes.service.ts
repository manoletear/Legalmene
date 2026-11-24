import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { accesoActual } from "../../common/acceso/contexto";
import { and, asc, count, eq, ilike, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import {
  CAMPOS_INFORME_AFILIADOS,
  CAMPOS_INFORME_ATENCIONES,
  ESTADOS_TERMINALES,
  MAX_FILAS_EXPORTACION,
  type CampoInformeAfiliado,
  type CampoInformeAtencion,
  type InformeAfiliados,
  type FilaController,
  type FilaReporteCanal,
  type FilaReportePlan,
  type InformeAtenciones,
  type Periodo,
  type SerieAfiliadosMes,
  CAMPOS_CONTROLLER_ATENCIONES,
  type CampoControllerAtenciones,
  type ControllerAtenciones,
  type FilaControllerAtencion,
  type FilaCompromisoReporte,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { fechaChile, rangoFechas, rutComparable } from "../../common/busqueda/criterios";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados, planesAfiliado } from "../../db/schema/afiliados";
import { formatearRut } from "../../common/utils/rut";
import { planVigenteSql } from "../afiliados/vigencia";
import { canales, planes } from "../../db/schema/planes";
import { gestiones } from "../../db/schema/gestiones";
import { comites, compromisosComite, participantesComite } from "../../db/schema/comites";
import { alias } from "drizzle-orm/pg-core";
import { perfiles, usuarios } from "../../db/schema/usuarios";
import { filasAtencionDetalle, type FilaAtencionDetalle } from "../exports/exports.service";
import { libroXlsx, type ColumnaXlsx, type HojaGenerica } from "../exports/xlsx";
import { conteoVacio, mesesDelPeriodo, sumar, tasaUso } from "./calculo";

const MAX_MESES = 36;

export interface FiltroRelaciones {
  codPlan?: string;
  canalId?: string;
  rut?: string;
}

const fechaCl = (d: Date | null) => (d ? new Date(d).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }) : "");
const fechaIso = (d: string | null) => (d ? d.split("-").reverse().join("-") : "");

// Atención contada en un reporte por plan o canal, con el plan o canal bajo el que se contó.
type FilaListado = FilaAtencionDetalle & { reportadoEn: string };

function hojaListadoAtenciones(filas: FilaListado[], etiqueta: string): HojaGenerica {
  return {
    nombre: "Atenciones",
    columnas: [
      { titulo: etiqueta, valor: (r: FilaListado) => r.reportadoEn, ancho: 22 },
      { titulo: "Correlativo", valor: (r: FilaListado) => r.correlativo, ancho: 20 },
      { titulo: "Tipo", valor: (r: FilaListado) => r.tipo },
      { titulo: "Fecha inicio", valor: (r: FilaListado) => fechaCl(r.fechaApertura) },
      { titulo: "RUT afiliado", valor: (r: FilaListado) => r.rut },
      { titulo: "Nombre afiliado", valor: (r: FilaListado) => r.afiliado, ancho: 28 },
      { titulo: "Plan de registro", valor: (r: FilaListado) => r.plan ?? r.codPlan, ancho: 22 },
      { titulo: "Materia", valor: (r: FilaListado) => r.materia, ancho: 24 },
      { titulo: "Estado", valor: (r: FilaListado) => r.estado },
      { titulo: "Abogado", valor: (r: FilaListado) => r.abogado ?? "", ancho: 24 },
    ],
    filas,
  };
}

export interface FiltroController {
  desde?: string;
  hasta?: string;
  perfilId?: string;
  jefeId?: string;
  cargo?: string;
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
  // Las relaciones y afiliados eliminados (soft-delete) no cuentan.
  private vigenteEnPeriodo(p: Periodo): SQL {
    return sql`${planesAfiliado.fechaInicio} <= ${p.hasta}::date and (${planesAfiliado.fechaTermino} is null or ${planesAfiliado.fechaTermino} >= ${p.desde}::date)
      and ${planesAfiliado.vigencia} <> 'Eliminado'
      and not exists (select 1 from afiliados ae where ae.id = ${planesAfiliado.afiliadoId} and ae.vigencia = 'Eliminado')`;
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
      body.estado ? eq(atenciones.estado, body.estado) : undefined,
      body.materiaId ? eq(atenciones.materiaId, body.materiaId) : undefined,
      body.tema ? ilike(atenciones.asunto, `%${body.tema}%`) : undefined,
      body.rut
        ? sql`${atenciones.afiliadoId} in (select a.id from afiliados a where upper(regexp_replace(a.rut, '[^0-9kK]', '', 'g')) like ${`%${rutComparable(body.rut)}%`})`
        : undefined,
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
      .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, perfil: perfiles.nombre, cargo: usuarios.cargo })
      .from(usuarios)
      .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
      .where(
        and(
          inArray(usuarios.id, [...ids]),
          f.perfilId ? eq(usuarios.perfilId, f.perfilId) : undefined,
          f.jefeId ? eq(usuarios.jefeId, f.jefeId) : undefined,
          f.cargo ? ilike(usuarios.cargo, `%${f.cargo}%`) : undefined,
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
          cargo: u.cargo,
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
          { titulo: "Cargo", valor: (r: FilaController) => r.cargo ?? "", ancho: 22 },
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

  // Controller de asesorías, juicios y consultas (Anexo §XIII l.2418–2460).
  async controllerAtenciones(f: ControllerAtenciones): Promise<FilaControllerAtencion[]> {
    this.asegurarVerAfiliados();
    const fechaAtencion = fechaChile(atenciones.fechaApertura);
    // Relación RUT–plan del plan elegido que contiene la fecha de la atención.
    const enVigencia = sql`exists (select 1 from planes_afiliado pa where pa.afiliado_id = ${atenciones.afiliadoId}
      and pa.cod_plan = ${f.codPlan} and pa.vigencia <> 'Eliminado'
      and pa.fecha_inicio <= ${fechaAtencion} and (pa.fecha_termino is null or pa.fecha_termino >= ${fechaAtencion}))`;
    // Materia cubierta por el plan para el tipo: la regla más específica no puede ser SinCobertura.
    const cubierta = sql`coalesce((select c.modalidad from coberturas c where c.cod_plan = ${f.codPlan} and c.vigente
      and (c.materia_id = ${atenciones.materiaId} or c.materia_id is null) and (c.tipo = ${atenciones.tipo} or c.tipo is null)
      order by (c.materia_id is not null) desc, (c.tipo is not null) desc limit 1), 'SinCobertura') <> 'SinCobertura'`;
    const where = and(
      filtroAtenciones(),
      eq(atenciones.tipo, f.tipo),
      enVigencia,
      f.tipo === "Consulta" ? undefined : cubierta,
      rangoFechas(atenciones.fechaApertura, f.desde, f.hasta),
    );
    const [{ n }] = await this.db.select({ n: count() }).from(atenciones).where(where);
    if (Number(n) > MAX_FILAS_EXPORTACION) {
      throw new BadRequestException(`El controller tiene ${Number(n).toLocaleString("es-CL")} atenciones; acote el período`);
    }
    const filas = await filasAtencionDetalle(this.db, where);
    if (!filas.length) return [];
    const vig = await this.db
      .select({ afiliadoId: planesAfiliado.afiliadoId, inicio: planesAfiliado.fechaInicio, termino: planesAfiliado.fechaTermino })
      .from(planesAfiliado)
      .where(and(eq(planesAfiliado.codPlan, f.codPlan), ne(planesAfiliado.vigencia, "Eliminado"), inArray(planesAfiliado.afiliadoId, [...new Set(filas.map((r) => r.afiliadoId))])));
    const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(d);
    return filas
      .map((r) => {
        const d = dia(r.fechaApertura);
        const v = vig.find((x) => x.afiliadoId === r.afiliadoId && x.inicio <= d && (!x.termino || x.termino >= d));
        return {
          id: r.id,
          rut: r.rut,
          afiliado: r.afiliado,
          correlativo: r.correlativo,
          planAtencion: r.codPlan,
          competencia: r.competencia,
          materia: r.materia,
          asunto: r.asunto,
          estado: r.estado,
          abogado: r.abogado,
          fechaApertura: r.fechaApertura.toISOString(),
          fechaCierre: r.fechaCierre?.toISOString() ?? null,
          vigenciaInicio: v?.inicio ?? "",
          vigenciaTermino: v?.termino ?? null,
        };
      })
      .sort((a, b) => a.rut.localeCompare(b.rut) || a.planAtencion.localeCompare(b.planAtencion) || a.fechaApertura.localeCompare(b.fechaApertura));
  }

  // Detalle con los campos elegidos y resumen agrupado por RUT y plan de la atención.
  async controllerAtencionesXlsx(f: ControllerAtenciones): Promise<Buffer> {
    const filas = await this.controllerAtenciones(f);
    const fecha = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago" }).format(new Date(iso)) : "");
    const valor: Record<CampoControllerAtenciones, (r: FilaControllerAtencion) => string> = {
      rut: (r) => r.rut,
      afiliado: (r) => r.afiliado,
      correlativo: (r) => r.correlativo,
      planAtencion: (r) => r.planAtencion,
      competencia: (r) => r.competencia,
      materia: (r) => r.materia,
      asunto: (r) => r.asunto,
      estado: (r) => r.estado,
      abogado: (r) => r.abogado ?? "",
      fechaApertura: (r) => fecha(r.fechaApertura),
      fechaCierre: (r) => fecha(r.fechaCierre),
      vigenciaInicio: (r) => r.vigenciaInicio,
      vigenciaTermino: (r) => r.vigenciaTermino ?? "",
    };
    const campos = f.campos?.length ? f.campos : (Object.keys(CAMPOS_CONTROLLER_ATENCIONES) as CampoControllerAtenciones[]);
    const grupos = new Map<string, { rut: string; afiliado: string; plan: string; n: number }>();
    for (const r of filas) {
      const k = `${r.rut}|${r.planAtencion}`;
      const g = grupos.get(k) ?? { rut: r.rut, afiliado: r.afiliado, plan: r.planAtencion, n: 0 };
      g.n++;
      grupos.set(k, g);
    }
    type Grupo = { rut: string; afiliado: string; plan: string; n: number };
    return libroXlsx([
      {
        nombre: "Resumen",
        columnas: [
          { titulo: "RUT", valor: (g: Grupo) => g.rut, ancho: 13 },
          { titulo: "Afiliado", valor: (g: Grupo) => g.afiliado, ancho: 28 },
          { titulo: "Plan de la atención", valor: (g: Grupo) => g.plan, ancho: 18 },
          { titulo: "Atenciones", valor: (g: Grupo) => g.n },
        ],
        filas: [...grupos.values()],
      },
      {
        nombre: "Detalle",
        columnas: campos.map((c) => ({ titulo: CAMPOS_CONTROLLER_ATENCIONES[c], valor: valor[c] })),
        filas,
      },
    ] as HojaGenerica[]);
  }

  // Compromisos de comité (Anexo §XIII l.2280): por defecto los pendientes, acotados al alcance de atenciones.
  async compromisos(f: { estado?: "Pendiente" | "Cumplido" | "NoCumplido"; responsableId?: string; soloVencidos?: boolean } = {}): Promise<FilaCompromisoReporte[]> {
    const resp = alias(usuarios, "resp");
    const reg = alias(usuarios, "reg");
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const filas = await this.db
      .select({
        id: compromisosComite.id,
        atencionId: compromisosComite.atencionId,
        correlativo: atenciones.correlativo,
        descripcion: compromisosComite.descripcion,
        responsable: resp.nombre,
        registradoPor: reg.nombre,
        registradoEn: compromisosComite.createdAt,
        plazo: compromisosComite.fechaCompromiso,
        estado: compromisosComite.estado,
      })
      .from(compromisosComite)
      .innerJoin(atenciones, eq(atenciones.id, compromisosComite.atencionId))
      .innerJoin(resp, eq(resp.id, compromisosComite.responsableId))
      .innerJoin(reg, eq(reg.id, compromisosComite.creadoPorId))
      .where(
        and(
          filtroAtenciones(),
          eq(compromisosComite.estado, f.estado ?? "Pendiente"),
          f.responsableId ? eq(compromisosComite.responsableId, f.responsableId) : undefined,
          f.soloVencidos ? sql`${compromisosComite.fechaCompromiso} < ${hoy}` : undefined,
        ),
      )
      .orderBy(asc(compromisosComite.fechaCompromiso))
      .limit(MAX_FILAS_EXPORTACION);
    return filas.map((r) => ({
      ...r,
      registradoEn: r.registradoEn.toISOString(),
      vencido: r.estado === "Pendiente" && r.plazo < hoy,
    }));
  }

  async compromisosXlsx(f: Parameters<ReportesService["compromisos"]>[0]): Promise<Buffer> {
    const filas = await this.compromisos(f);
    type F = FilaCompromisoReporte;
    return libroXlsx([
      {
        nombre: "Compromisos",
        columnas: [
          { titulo: "Atención", valor: (r: F) => r.correlativo, ancho: 18 },
          { titulo: "Compromiso", valor: (r: F) => r.descripcion, ancho: 40 },
          { titulo: "Responsable", valor: (r: F) => r.responsable, ancho: 24 },
          { titulo: "Registrado por", valor: (r: F) => r.registradoPor, ancho: 24 },
          { titulo: "Registrado el", valor: (r: F) => new Date(r.registradoEn).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }) },
          { titulo: "Plazo", valor: (r: F) => r.plazo },
          { titulo: "Estado", valor: (r: F) => (r.vencido ? "Vencido" : r.estado) },
        ],
        filas,
      },
    ] as HojaGenerica[]);
  }

  // Los listados de RUT con datos personales exigen además ver afiliados.
  private asegurarVerAfiliados() {
    const acceso = accesoActual();
    if (acceso && !acceso.permisos.has("afiliados.ver")) {
      throw new ForbiddenException("Este informe incluye datos de afiliados: requiere el permiso de ver afiliados");
    }
  }

  // Relaciones RUT–Plan vigentes algún día del período (Anexo §XII B, §XIII A–C), por canal y plan.
  async relacionesEnPeriodo(p: Periodo, f: FiltroRelaciones = {}) {
    this.asegurarVerAfiliados();
    const filas = await this.db
      .select({
        rut: afiliados.rut,
        nombre: sql<string>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno} || coalesce(' ' || ${afiliados.apellidoMaterno}, '')`,
        email: afiliados.email,
        telefono: afiliados.telefono,
        direccion: afiliados.direccion,
        comuna: afiliados.comuna,
        ciudad: afiliados.ciudad,
        region: afiliados.region,
        fechaNacimiento: afiliados.fechaNacimiento,
        codPlan: planesAfiliado.codPlan,
        plan: planes.nombre,
        canal: canales.nombre,
        fechaInicio: planesAfiliado.fechaInicio,
        fechaTermino: planesAfiliado.fechaTermino,
        vigencia: planesAfiliado.vigencia,
        vigenteHoy: planVigenteSql,
      })
      .from(planesAfiliado)
      .innerJoin(afiliados, eq(afiliados.id, planesAfiliado.afiliadoId))
      .innerJoin(planes, eq(planes.codPlan, planesAfiliado.codPlan))
      .leftJoin(canales, eq(canales.id, planes.canalId))
      .where(
        and(
          this.vigenteEnPeriodo(p),
          f.codPlan ? eq(planesAfiliado.codPlan, f.codPlan) : undefined,
          f.canalId ? eq(planes.canalId, f.canalId) : undefined,
          f.rut ? eq(afiliados.rut, formatearRut(f.rut)) : undefined,
        ),
      )
      .orderBy(sql`${canales.nombre} nulls last`, asc(planesAfiliado.codPlan), asc(afiliados.rut))
      .limit(MAX_FILAS_EXPORTACION + 1);
    if (filas.length > MAX_FILAS_EXPORTACION) {
      throw new BadRequestException(`El resultado supera ${MAX_FILAS_EXPORTACION} filas; acote el período o el plan`);
    }
    return filas.map((r) => ({ ...r, vigenteHoy: Boolean(r.vigenteHoy) }));
  }

  // Atenciones que cuentan los reportes por plan (o canal), con el plan (o canal) bajo el que se
  // contaron: consultas de la nómina dentro de la vigencia RUT–Plan y el resto por plan de registro.
  async listadoAtenciones(p: Periodo, f: { codPlan?: string; canalId?: string }, por: "plan" | "canal"): Promise<FilaListado[]> {
    const enPeriodo = rangoFechas(atenciones.fechaApertura, p.desde, p.hasta);
    const enCanal = (col: typeof planesAfiliado.codPlan | typeof atenciones.codPlan) =>
      f.canalId ? sql`${col} in (select pl.cod_plan from planes pl where pl.canal_id = ${f.canalId})` : undefined;
    const [consultas, otras] = await Promise.all([
      this.db
        .selectDistinct({ id: atenciones.id, codPlan: planesAfiliado.codPlan })
        .from(atenciones)
        .innerJoin(planesAfiliado, and(eq(planesAfiliado.afiliadoId, atenciones.afiliadoId), this.dentroDeVigencia()))
        .where(
          and(
            filtroAtenciones(),
            eq(atenciones.tipo, "Consulta"),
            enPeriodo,
            f.codPlan ? eq(planesAfiliado.codPlan, f.codPlan) : undefined,
            enCanal(planesAfiliado.codPlan),
          ),
        ),
      this.db
        .select({ id: atenciones.id, codPlan: atenciones.codPlan })
        .from(atenciones)
        .where(
          and(
            filtroAtenciones(),
            ne(atenciones.tipo, "Consulta"),
            enPeriodo,
            f.codPlan ? eq(atenciones.codPlan, f.codPlan) : undefined,
            enCanal(atenciones.codPlan),
          ),
        ),
    ]);
    const catalogo = await this.catalogoPlanes();
    const etiqueta = (cod: string) => {
      const pl = catalogo.find((c) => c.codPlan === cod);
      return por === "plan" ? `${cod} — ${pl?.nombre ?? cod}` : (pl?.canal ?? "Sin canal");
    };
    // Por canal, una atención se lista una sola vez por canal aunque el RUT tenga dos planes del canal.
    const pares = new Map<string, { id: string; reportadoEn: string }>();
    for (const r of [...consultas, ...otras]) {
      const reportadoEn = etiqueta(r.codPlan);
      pares.set(`${r.id}|${reportadoEn}`, { id: r.id, reportadoEn });
    }
    if (pares.size > MAX_FILAS_EXPORTACION) {
      throw new BadRequestException(`El listado supera ${MAX_FILAS_EXPORTACION} atenciones; acote el período`);
    }
    const ids = [...new Set([...pares.values()].map((x) => x.id))];
    const detalle = new Map<string, FilaAtencionDetalle>();
    for (let i = 0; i < ids.length; i += 5000) {
      for (const d of await filasAtencionDetalle(this.db, inArray(atenciones.id, ids.slice(i, i + 5000)))) detalle.set(d.id, d);
    }
    return [...pares.values()]
      .filter((x) => detalle.has(x.id))
      .map((x) => ({ ...detalle.get(x.id)!, reportadoEn: x.reportadoEn }))
      .sort((a, b) => a.reportadoEn.localeCompare(b.reportadoEn, "es") || a.correlativo.localeCompare(b.correlativo));
  }

  async xlsxPorPlan(p: Periodo, codPlan?: string): Promise<Buffer> {
    const [filas, listado] = await Promise.all([this.porPlan(p, codPlan), this.listadoAtenciones(p, { codPlan }, "plan")]);
    return libroXlsx([hojaPlanes("Reporte por plan", filas), hojaListadoAtenciones(listado, "Plan reportado")]);
  }

  async xlsxPorCanal(p: Periodo, canalId?: string): Promise<Buffer> {
    const [canalesFilas, listado] = await Promise.all([this.porCanal(p, canalId), this.listadoAtenciones(p, { canalId }, "canal")]);
    const resumen = canalesFilas.map((c) => ({ ...c, codPlan: "", nombre: c.canal, canal: c.canal }));
    return libroXlsx([
      hojaPlanes("Resumen por canal", resumen, true),
      hojaPlanes("Detalle por plan", canalesFilas.flatMap((c) => c.planes)),
      hojaListadoAtenciones(listado, "Canal"),
    ]);
  }

  // Informe de afiliados (Anexo §XIII A–C): hoja "Resumen" por plan y hoja "Afiliados" con los
  // campos elegidos, una fila por relación RUT–Plan vigente algún día del período.
  async informeAfiliadosXlsx(body: InformeAfiliados): Promise<Buffer> {
    const filas = await this.relacionesEnPeriodo(body, body);
    type Rel = (typeof filas)[number];
    const valor = (r: Rel, c: CampoInformeAfiliado): string => {
      switch (c) {
        case "fechaInicio":
        case "fechaTermino":
        case "fechaNacimiento":
          return fechaIso(r[c]);
        case "vigenteHoy":
          return r.vigenteHoy ? "Sí" : "No";
        case "canal":
          return r.canal ?? "Sin canal";
        default:
          return r[c] ?? "";
      }
    };
    const enPeriodo = (d: string | null) => !!d && d >= body.desde && d <= body.hasta;
    const resumen = new Map<string, { codPlan: string; plan: string; canal: string; ruts: Set<string>; altas: number; bajas: number; vigentesHoy: Set<string> }>();
    for (const r of filas) {
      const g = resumen.get(r.codPlan) ?? { codPlan: r.codPlan, plan: r.plan, canal: r.canal ?? "Sin canal", ruts: new Set(), altas: 0, bajas: 0, vigentesHoy: new Set() };
      g.ruts.add(r.rut);
      if (r.vigenteHoy) g.vigentesHoy.add(r.rut);
      if (enPeriodo(r.fechaInicio)) g.altas++;
      if (enPeriodo(r.fechaTermino)) g.bajas++;
      resumen.set(r.codPlan, g);
    }
    type Res = typeof resumen extends Map<string, infer V> ? V : never;
    return libroXlsx([
      {
        nombre: "Resumen",
        columnas: [
          { titulo: "Canal", valor: (r: Res) => r.canal, ancho: 22 },
          { titulo: "Cód. plan", valor: (r: Res) => r.codPlan },
          { titulo: "Plan", valor: (r: Res) => r.plan, ancho: 26 },
          { titulo: "RUT vigentes en el período", valor: (r: Res) => r.ruts.size },
          { titulo: "Altas en el período", valor: (r: Res) => r.altas },
          { titulo: "Términos en el período", valor: (r: Res) => r.bajas },
          { titulo: "Vigentes hoy", valor: (r: Res) => r.vigentesHoy.size },
        ],
        filas: [...resumen.values()],
      },
      {
        nombre: "Afiliados",
        columnas: body.campos.map((c) => ({
          titulo: CAMPOS_INFORME_AFILIADOS[c],
          valor: (r: Rel) => valor(r, c),
          ancho: c === "nombre" || c === "direccion" || c === "email" ? 28 : 16,
        })),
        filas,
      },
    ]);
  }

  async xlsxAfiliadosMes(p: Periodo, filtro: { codPlan?: string; canalId?: string }): Promise<Buffer> {
    const [serie, relaciones] = await Promise.all([this.afiliadosPorMes(p, filtro), this.relacionesEnPeriodo(p, filtro)]);
    type Rel = (typeof relaciones)[number];
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
      {
        nombre: "RUT vigentes",
        columnas: [
          { titulo: "Canal", valor: (r: Rel) => r.canal ?? "Sin canal", ancho: 22 },
          { titulo: "Cód. plan", valor: (r: Rel) => r.codPlan },
          { titulo: "Plan", valor: (r: Rel) => r.plan, ancho: 26 },
          { titulo: "RUT", valor: (r: Rel) => r.rut },
          { titulo: "Nombre", valor: (r: Rel) => r.nombre, ancho: 28 },
          { titulo: "Inicio vigencia", valor: (r: Rel) => fechaIso(r.fechaInicio) },
          { titulo: "Término vigencia", valor: (r: Rel) => fechaIso(r.fechaTermino) },
        ],
        filas: relaciones,
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

