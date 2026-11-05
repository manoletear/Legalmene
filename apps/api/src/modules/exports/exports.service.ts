import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  MAX_FILAS_EXPORTACION,
  type BusquedaExportable,
  type CriteriosBusqueda,
  type Permiso,
  type TipoAtencion,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { filtroAtenciones } from "../../common/acceso/alcance";
import { accesoActual } from "../../common/acceso/contexto";
import { condicionAtencion, rutComparable } from "../../common/busqueda/criterios";
import { afiliados, planesAfiliado } from "../../db/schema/afiliados";
import { atenciones, derivaciones } from "../../db/schema/atenciones";
import { competencias, materias, organismos, tiposConsulta, tribunales } from "../../db/schema/maestros";
import { canales, planes } from "../../db/schema/planes";
import { usuarios } from "../../db/schema/usuarios";
import { arancelesAtencion } from "../../db/schema/finanzas";
import { provisiones } from "../../db/schema/provisiones";
import { pagos } from "../../db/schema/pagos";
import { condicionPagos, type FiltroPagos } from "../pagos/pagos.service";
import { libroXlsx, type ColumnaXlsx } from "./xlsx";

export interface FiltroExportacion extends CriteriosBusqueda {
  estado?: string;
  q?: string;
  vigencia?: string;
  ordenCompra?: string;
}

const TIPO_POR_BUSQUEDA: Partial<Record<BusquedaExportable, TipoAtencion>> = {
  consultas: "Consulta",
  asesorias: "Asesoria",
  juicios: "Juicio",
};

// Permiso adicional a exportar.datos según la búsqueda (el mismo que exige su listado).
const PERMISO_EXTRA: Partial<Record<BusquedaExportable, Permiso>> = {
  afiliados: "afiliados.ver",
  aranceles: "finanzas.ver",
  pagos: "pagos.ver",
};

const fechaCl = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }) : "";
const horaCl = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" }) : "";
const ufTexto = (centesimas: number | null | undefined) => (centesimas == null ? "" : centesimas / 100);

const abogado = alias(usuarios, "abogado");
const solicitante = alias(usuarios, "solicitante");
const derivada = alias(atenciones, "derivada");

// Atenciones con los nombres que muestran búsquedas e informes (afiliado, plan, canal, abogado…).
export function filasAtencionDetalle(db: Database, where: SQL | undefined) {
  return db
    .select({
      id: atenciones.id,
      correlativo: atenciones.correlativo,
      tipo: atenciones.tipo,
      codPlan: atenciones.codPlan,
      prioridad: atenciones.prioridad,
      rut: afiliados.rut,
      afiliado: sql<string>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno} || coalesce(' ' || ${afiliados.apellidoMaterno}, '')`,
      plan: planes.nombre,
      canal: canales.nombre,
      abogado: abogado.nombre,
      competencia: competencias.nombre,
      materia: materias.nombre,
      asunto: atenciones.asunto,
      estado: atenciones.estado,
      fechaApertura: atenciones.fechaApertura,
      fechaCierre: atenciones.fechaCierre,
      horaInicio: atenciones.horaInicio,
      tipoConsulta: tiposConsulta.nombre,
      codigoGrabacion: atenciones.codigoGrabacion,
      organismo: organismos.nombre,
      tribunal: tribunales.nombre,
      rolCausa: atenciones.rolCausa,
      estadoDerivacion: sql<string | null>`(select d.estado from derivaciones d where d.consulta_id = ${atenciones.id} order by d.created_at desc limit 1)`,
    })
    .from(atenciones)
    .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
    .innerJoin(competencias, eq(competencias.id, atenciones.competenciaId))
    .innerJoin(materias, eq(materias.id, atenciones.materiaId))
    .leftJoin(planes, eq(planes.codPlan, atenciones.codPlan))
    .leftJoin(canales, eq(canales.id, planes.canalId))
    .leftJoin(abogado, eq(abogado.id, atenciones.abogadoAsignadoId))
    .leftJoin(tiposConsulta, eq(tiposConsulta.id, atenciones.tipoConsultaId))
    .leftJoin(organismos, eq(organismos.id, atenciones.organismoId))
    .leftJoin(tribunales, eq(tribunales.id, atenciones.tribunalId))
    .where(where)
    .orderBy(desc(atenciones.fechaApertura));
}
export type FilaAtencionDetalle = Awaited<ReturnType<typeof filasAtencionDetalle>>[number];

@Injectable()
export class ExportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Búsqueda del Anexo §XI exportada a XLSX, con el mismo alcance y criterios que su pantalla.
  async busqueda(tipo: BusquedaExportable, f: FiltroExportacion): Promise<{ archivo: Buffer; filas: number }> {
    const extra = PERMISO_EXTRA[tipo];
    if (extra && !(accesoActual()?.permisos.has(extra) ?? true)) {
      throw new ForbiddenException("Su perfil no puede exportar esta búsqueda");
    }
    const tipoAtencion = TIPO_POR_BUSQUEDA[tipo];
    if (tipoAtencion) return this.atenciones(tipoAtencion, f);
    switch (tipo) {
      case "afiliados":
        return this.afiliados(f);
      case "derivaciones":
        return this.derivaciones(f);
      case "aranceles":
        return this.aranceles(f);
      case "provisiones":
        return this.provisiones(f);
      case "pagos":
        return this.pagos(f);
      default:
        throw new BadRequestException(`Búsqueda ${tipo} no exportable`);
    }
  }

  private async asegurarTope(total: number) {
    if (total > MAX_FILAS_EXPORTACION) {
      throw new BadRequestException(
        `La búsqueda tiene ${total.toLocaleString("es-CL")} filas y el máximo exportable es ${MAX_FILAS_EXPORTACION.toLocaleString("es-CL")}. Agregue criterios para acotarla.`,
      );
    }
  }

  private async contar(from: () => Promise<{ value: number }[]>): Promise<void> {
    const [{ value }] = await from();
    await this.asegurarTope(Number(value));
  }

  private async libro<T>(nombre: string, columnas: ColumnaXlsx<T>[], filas: T[]) {
    return { archivo: await libroXlsx([{ nombre, columnas, filas }]), filas: filas.length };
  }

  // Anexo §XI A: listado de consultas, asesorías o juicios con sus columnas.
  private async atenciones(tipo: TipoAtencion, f: FiltroExportacion) {
    const where = and(
      filtroAtenciones(),
      eq(atenciones.tipo, tipo),
      condicionAtencion(f),
      f.estado ? sql`${atenciones.estado} = ${f.estado}` : undefined,
      f.q ? sql`search_vector @@ plainto_tsquery('spanish', ${f.q})` : undefined,
    );
    await this.contar(() => this.db.select({ value: count() }).from(atenciones).where(where));
    const filas = await filasAtencionDetalle(this.db, where);
    type Fila = FilaAtencionDetalle;

    const comunes: ColumnaXlsx<Fila>[] = [
      { titulo: "Correlativo", valor: (r) => r.correlativo, ancho: 18 },
      { titulo: "RUT afiliado", valor: (r) => r.rut, ancho: 13 },
      { titulo: "Nombre afiliado", valor: (r) => r.afiliado, ancho: 28 },
      { titulo: "Plan", valor: (r) => r.plan, ancho: 22 },
      { titulo: "Canal", valor: (r) => r.canal },
      { titulo: "Abogado", valor: (r) => r.abogado, ancho: 22 },
      { titulo: "Competencia", valor: (r) => r.competencia, ancho: 16 },
      { titulo: "Materia", valor: (r) => r.materia, ancho: 26 },
      { titulo: "Asunto", valor: (r) => r.asunto, ancho: 30 },
      { titulo: "Fecha inicio", valor: (r) => fechaCl(r.fechaApertura) },
      { titulo: "Fecha término", valor: (r) => fechaCl(r.fechaCierre) },
      { titulo: "Estado", valor: (r) => r.estado },
    ];
    const porTipo: Record<TipoAtencion, ColumnaXlsx<Fila>[]> = {
      Consulta: [
        ...comunes,
        { titulo: "Hora", valor: (r) => horaCl(r.horaInicio ?? r.fechaApertura) },
        { titulo: "Estado derivación", valor: (r) => r.estadoDerivacion ?? "" },
        { titulo: "Tipo consulta", valor: (r) => r.tipoConsulta },
        { titulo: "Código grabación", valor: (r) => r.codigoGrabacion },
      ],
      Asesoria: [...comunes, { titulo: "Organismo", valor: (r) => r.organismo, ancho: 22 }],
      Juicio: [
        ...comunes,
        { titulo: "Tribunal", valor: (r) => r.tribunal, ancho: 24 },
        { titulo: "ROL/RIT", valor: (r) => r.rolCausa },
      ],
    };
    const nombre = { Consulta: "Consultas", Asesoria: "Asesorías", Juicio: "Juicios" }[tipo];
    return this.libro(nombre, porTipo[tipo], filas);
  }

  // Anexo §XI B: una fila por relación RUT–Plan.
  private async afiliados(f: FiltroExportacion) {
    const rut = f.rut ? rutComparable(f.rut) : "";
    const where = and(
      f.codPlan ? eq(planesAfiliado.codPlan, f.codPlan) : undefined,
      f.canalId ? eq(planes.canalId, f.canalId) : undefined,
      rut ? sql`upper(regexp_replace(${afiliados.rut}, '[^0-9kK]', '', 'g')) like ${`%${rut}%`}` : undefined,
      f.vigencia ? sql`${afiliados.vigencia} = ${f.vigencia}` : undefined,
      f.q
        ? sql`(${afiliados.rut} ilike ${`%${f.q}%`} or ${afiliados.nombres} ilike ${`%${f.q}%`} or ${afiliados.apellidoPaterno} ilike ${`%${f.q}%`} or ${afiliados.email} ilike ${`%${f.q}%`})`
        : undefined,
    );
    const base = () =>
      this.db
        .select({ value: count() })
        .from(planesAfiliado)
        .innerJoin(afiliados, eq(afiliados.id, planesAfiliado.afiliadoId))
        .innerJoin(planes, eq(planes.codPlan, planesAfiliado.codPlan))
        .where(where);
    await this.contar(base);
    const filas = await this.db
      .select({
        rut: afiliados.rut,
        nombre: sql<string>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno} || coalesce(' ' || ${afiliados.apellidoMaterno}, '')`,
        email: afiliados.email,
        telefono: afiliados.telefono,
        region: afiliados.region,
        comuna: afiliados.comuna,
        codPlan: planesAfiliado.codPlan,
        plan: planes.nombre,
        canal: canales.nombre,
        fechaInicio: planesAfiliado.fechaInicio,
        fechaTermino: planesAfiliado.fechaTermino,
        vigencia: planesAfiliado.vigencia,
      })
      .from(planesAfiliado)
      .innerJoin(afiliados, eq(afiliados.id, planesAfiliado.afiliadoId))
      .innerJoin(planes, eq(planes.codPlan, planesAfiliado.codPlan))
      .leftJoin(canales, eq(canales.id, planes.canalId))
      .where(where)
      .orderBy(afiliados.apellidoPaterno, afiliados.nombres, planesAfiliado.codPlan);
    return this.libro(
      "Afiliados",
      [
        { titulo: "RUT", valor: (r) => r.rut, ancho: 13 },
        { titulo: "Nombre", valor: (r) => r.nombre, ancho: 28 },
        { titulo: "Correo", valor: (r) => r.email, ancho: 26 },
        { titulo: "Teléfono", valor: (r) => r.telefono },
        { titulo: "Región", valor: (r) => r.region },
        { titulo: "Comuna", valor: (r) => r.comuna },
        { titulo: "Cód. plan", valor: (r) => r.codPlan },
        { titulo: "Plan", valor: (r) => r.plan, ancho: 22 },
        { titulo: "Canal", valor: (r) => r.canal },
        { titulo: "Fecha inicio", valor: (r) => r.fechaInicio },
        { titulo: "Fecha término", valor: (r) => r.fechaTermino },
        { titulo: "Vigencia", valor: (r) => r.vigencia },
      ],
      filas,
    );
  }

  private async derivaciones(f: FiltroExportacion) {
    const where = and(
      filtroAtenciones(),
      condicionAtencion(f, derivaciones.createdAt),
      f.estado ? sql`${derivaciones.estado} = ${f.estado}` : undefined,
    );
    await this.contar(() =>
      this.db
        .select({ value: count() })
        .from(derivaciones)
        .innerJoin(atenciones, eq(atenciones.id, derivaciones.consultaId))
        .where(where),
    );
    const filas = await this.db
      .select({
        consulta: atenciones.correlativo,
        rut: afiliados.rut,
        nuevoTipo: derivaciones.nuevoTipo,
        motivo: derivaciones.motivo,
        estado: derivaciones.estado,
        solicitadaPor: solicitante.nombre,
        creada: derivaciones.createdAt,
        resuelta: derivaciones.resueltaAt,
        derivada: derivada.correlativo,
      })
      .from(derivaciones)
      .innerJoin(atenciones, eq(atenciones.id, derivaciones.consultaId))
      .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
      .leftJoin(solicitante, eq(solicitante.id, derivaciones.solicitadaPorId))
      .leftJoin(derivada, eq(derivada.id, derivaciones.atencionDerivadaId))
      .where(where)
      .orderBy(desc(derivaciones.createdAt));
    return this.libro(
      "Derivaciones",
      [
        { titulo: "Consulta", valor: (r) => r.consulta, ancho: 18 },
        { titulo: "RUT afiliado", valor: (r) => r.rut },
        { titulo: "Derivar a", valor: (r) => r.nuevoTipo },
        { titulo: "Motivo", valor: (r) => r.motivo, ancho: 34 },
        { titulo: "Estado", valor: (r) => r.estado },
        { titulo: "Solicitada por", valor: (r) => r.solicitadaPor, ancho: 22 },
        { titulo: "Fecha solicitud", valor: (r) => fechaCl(r.creada) },
        { titulo: "Fecha resolución", valor: (r) => fechaCl(r.resuelta) },
        { titulo: "Atención derivada", valor: (r) => r.derivada, ancho: 18 },
      ],
      filas,
    );
  }

  // Anexo §XI C: aranceles con su estado y fecha de movimiento.
  private async aranceles(f: FiltroExportacion) {
    const where = and(
      filtroAtenciones(),
      condicionAtencion(f, arancelesAtencion.updatedAt),
      f.estado ? sql`${arancelesAtencion.estado} = ${f.estado}` : undefined,
    );
    await this.contar(() =>
      this.db
        .select({ value: count() })
        .from(arancelesAtencion)
        .innerJoin(atenciones, eq(atenciones.id, arancelesAtencion.atencionId))
        .where(where),
    );
    const filas = await this.db
      .select({
        correlativo: atenciones.correlativo,
        tipo: atenciones.tipo,
        rut: afiliados.rut,
        plan: atenciones.codPlan,
        abogado: abogado.nombre,
        estado: arancelesAtencion.estado,
        copagoUf: arancelesAtencion.copagoUfCentesimas,
        montoClp: arancelesAtencion.montoClp,
        medio: arancelesAtencion.medioPago,
        fechaPago: arancelesAtencion.fechaPago,
        actualizado: arancelesAtencion.updatedAt,
      })
      .from(arancelesAtencion)
      .innerJoin(atenciones, eq(atenciones.id, arancelesAtencion.atencionId))
      .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
      .leftJoin(abogado, eq(abogado.id, atenciones.abogadoAsignadoId))
      .where(where)
      .orderBy(desc(arancelesAtencion.updatedAt));
    return this.libro(
      "Aranceles",
      [
        { titulo: "Correlativo", valor: (r) => r.correlativo, ancho: 18 },
        { titulo: "Tipo atención", valor: (r) => r.tipo },
        { titulo: "RUT cliente", valor: (r) => r.rut },
        { titulo: "Plan", valor: (r) => r.plan },
        { titulo: "Abogado", valor: (r) => r.abogado, ancho: 22 },
        { titulo: "Estado", valor: (r) => r.estado },
        { titulo: "Copago UF", valor: (r) => ufTexto(r.copagoUf) },
        { titulo: "Monto pagado CLP", valor: (r) => r.montoClp },
        { titulo: "Medio de pago", valor: (r) => r.medio },
        { titulo: "Fecha pago", valor: (r) => r.fechaPago },
        { titulo: "Último movimiento", valor: (r) => fechaCl(r.actualizado) },
      ],
      filas,
    );
  }

  private async provisiones(f: FiltroExportacion) {
    const where = and(
      filtroAtenciones(),
      condicionAtencion(f, provisiones.fechaSolicitud),
      f.estado ? sql`${provisiones.estado} = ${f.estado}` : undefined,
    );
    await this.contar(() =>
      this.db
        .select({ value: count() })
        .from(provisiones)
        .innerJoin(atenciones, eq(atenciones.id, provisiones.atencionId))
        .where(where),
    );
    const filas = await this.db
      .select({
        correlativo: atenciones.correlativo,
        tipo: atenciones.tipo,
        rut: afiliados.rut,
        abogado: abogado.nombre,
        monto: provisiones.monto,
        entregado: provisiones.montoEntregado,
        estado: provisiones.estado,
        motivo: provisiones.motivo,
        solicitadaPor: solicitante.nombre,
        fechaSolicitud: provisiones.fechaSolicitud,
        fechaResolucion: provisiones.fechaResolucion,
      })
      .from(provisiones)
      .innerJoin(atenciones, eq(atenciones.id, provisiones.atencionId))
      .innerJoin(afiliados, eq(afiliados.id, atenciones.afiliadoId))
      .leftJoin(abogado, eq(abogado.id, atenciones.abogadoAsignadoId))
      .leftJoin(solicitante, eq(solicitante.id, provisiones.solicitadaPorId))
      .where(where)
      .orderBy(desc(provisiones.fechaSolicitud));
    return this.libro(
      "Provisiones",
      [
        { titulo: "Correlativo", valor: (r) => r.correlativo, ancho: 18 },
        { titulo: "Tipo atención", valor: (r) => r.tipo },
        { titulo: "RUT cliente", valor: (r) => r.rut },
        { titulo: "Abogado responsable", valor: (r) => r.abogado, ancho: 22 },
        { titulo: "Monto solicitado", valor: (r) => r.monto },
        { titulo: "Monto entregado", valor: (r) => r.entregado },
        { titulo: "Estado", valor: (r) => r.estado },
        { titulo: "Motivo", valor: (r) => r.motivo, ancho: 30 },
        { titulo: "Solicitada por", valor: (r) => r.solicitadaPor, ancho: 22 },
        { titulo: "Fecha solicitud", valor: (r) => fechaCl(r.fechaSolicitud) },
        { titulo: "Fecha resolución", valor: (r) => fechaCl(r.fechaResolucion) },
      ],
      filas,
    );
  }

  // Anexo §XI C WebPay: orden, fecha, contratante, RUT, monto, tipo, código, correo, región, comuna.
  private async pagos(f: FiltroExportacion) {
    const where: SQL | undefined = condicionPagos(f as FiltroPagos);
    await this.contar(() => this.db.select({ value: count() }).from(pagos).where(where));
    const filas = await this.db
      .select({
        orden: pagos.ordenCompra,
        fecha: pagos.fechaIniciado,
        nombre: sql<string>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno}`,
        rut: afiliados.rut,
        monto: pagos.monto,
        tipo: sql<string>`case when ${pagos.atencionId} is null then 'Compra de plan' else 'Arancel' end`,
        codigo: pagos.authCode,
        correo: afiliados.email,
        region: afiliados.region,
        comuna: afiliados.comuna,
        estado: pagos.estado,
      })
      .from(pagos)
      .innerJoin(afiliados, eq(afiliados.id, pagos.afiliadoId))
      .where(where)
      .orderBy(desc(pagos.fechaIniciado));
    return this.libro(
      "WebPay",
      [
        { titulo: "Número de orden", valor: (r) => r.orden, ancho: 30 },
        { titulo: "Fecha", valor: (r) => (r.fecha ? new Date(r.fecha).toLocaleString("es-CL", { timeZone: "America/Santiago" }) : "") },
        { titulo: "Nombre contratante", valor: (r) => r.nombre, ancho: 26 },
        { titulo: "RUT", valor: (r) => r.rut },
        { titulo: "Monto", valor: (r) => r.monto },
        { titulo: "Tipo", valor: (r) => r.tipo },
        { titulo: "Código", valor: (r) => r.codigo },
        { titulo: "Correo", valor: (r) => r.correo, ancho: 26 },
        { titulo: "Región", valor: (r) => r.region },
        { titulo: "Comuna", valor: (r) => r.comuna },
        { titulo: "Estado", valor: (r) => r.estado },
      ],
      filas,
    );
  }
}

