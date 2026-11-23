import { Inject, Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { afiliados, bienesAfiliado, cargasAfiliado, planesAfiliado, NuevoAfiliado } from "../../db/schema/afiliados";
import { perfilPermisos, perfiles, usuarios } from "../../db/schema/usuarios";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { libroXlsx } from "../exports/xlsx";
import { planes } from "../../db/schema/planes";
import { formatearRut, rutValido } from "../../common/utils/rut";
import { hoyChile } from "../afiliados/vigencia";
import {
  PARENTESCO_LABEL,
  ParentescoEnum,
  PERFIL_ADMIN,
  TipoBienEnum,
  type CargaMasivaResultado,
  type EntidadCargaMasiva,
  type TipoCargaMasiva,
} from "@legalmene/shared";

interface FilaCSV {
  rut: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  comuna?: string;
  region?: string;
  fecha_nacimiento?: string;
  fecha_inicio?: string;
  fecha_termino?: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface RegistroValido {
  fila: number;
  persona: NuevoAfiliado;
  fechaInicio: string | null;
  fechaTermino: string | null;
}

@Injectable()
export class CargasMasivasService {
  private readonly logger = new Logger(CargasMasivasService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
  ) {}

  /**
   * Anexo §III. Ambas modalidades:
   *   - Afiliados: si el RUT no existe se registra; si existe NO se actualizan sus datos.
   *   - PlanesAfiliado: si la relación RUT–Plan no existe se crea; si existe se actualiza
   *     la fecha de término (y vuelve a quedar Activa).
   * STOCK además termina (fecha_termino = hoy, vigencia Eliminado) las relaciones del plan
   * cuyos RUT no vienen en el archivo.
   */
  async cargarAfiliados(
    codPlan: string,
    tipo: TipoCargaMasiva,
    csvBuffer: Buffer,
  ): Promise<CargaMasivaResultado> {
    const inicio = Date.now();

    const [plan] = await this.db
      .select({ codPlan: planes.codPlan })
      .from(planes)
      .where(eq(planes.codPlan, codPlan));
    if (!plan) throw new NotFoundException(`Plan ${codPlan} no existe`);

    let filas: FilaCSV[];
    try {
      filas = parse(csvBuffer, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
      }) as FilaCSV[];
    } catch (err) {
      throw new BadRequestException(`CSV inválido: ${err instanceof Error ? err.message : err}`);
    }

    const resultado: CargaMasivaResultado = {
      entidad: "afiliados",
      tipo,
      codPlan,
      totalRegistros: filas.length,
      insertados: 0,
      actualizados: 0,
      eliminados: 0,
      errores: [],
      duracionMs: 0,
    };

    if (filas.length === 0) {
      resultado.duracionMs = Date.now() - inicio;
      return resultado;
    }

    // Validar y normalizar todas las filas antes de tocar la DB.
    const rutsValidos = new Set<string>();
    const registros: RegistroValido[] = [];

    filas.forEach((fila, idx) => {
      const nroLinea = idx + 2; // +1 por header, +1 por base 1.
      if (!fila.rut) {
        resultado.errores.push({
          fila: nroLinea,
          mensaje: "RUT vacío",
          datos: fila as unknown as Record<string, unknown>,
        });
        return;
      }
      if (!rutValido(fila.rut)) {
        resultado.errores.push({ fila: nroLinea, mensaje: `RUT inválido: ${fila.rut}` });
        return;
      }
      const rutFmt = formatearRut(fila.rut);
      if (rutsValidos.has(rutFmt)) {
        resultado.errores.push({ fila: nroLinea, mensaje: `RUT duplicado en archivo: ${rutFmt}` });
        return;
      }
      if (!fila.nombres || !fila.apellido_paterno) {
        resultado.errores.push({
          fila: nroLinea,
          mensaje: "nombres y apellido_paterno son obligatorios",
        });
        return;
      }
      for (const campo of ["fecha_inicio", "fecha_termino"] as const) {
        if (fila[campo] && !FECHA.test(fila[campo]!)) {
          resultado.errores.push({ fila: nroLinea, mensaje: `${campo} debe tener formato AAAA-MM-DD` });
          return;
        }
      }
      rutsValidos.add(rutFmt);
      registros.push({
        fila: nroLinea,
        persona: {
          rut: rutFmt,
          nombres: fila.nombres,
          apellidoPaterno: fila.apellido_paterno,
          apellidoMaterno: fila.apellido_materno || null,
          email: fila.email || null,
          telefono: fila.telefono || null,
          direccion: fila.direccion || null,
          comuna: fila.comuna || null,
          region: fila.region || null,
          fechaNacimiento: fila.fecha_nacimiento || null,
          vigencia: "Activo",
        },
        fechaInicio: fila.fecha_inicio || null,
        fechaTermino: fila.fecha_termino || null,
      });
    });

    if (registros.length === 0) {
      resultado.duracionMs = Date.now() - inicio;
      return resultado;
    }

    // Transacción para que el reemplazo de STOCK sea atómico.
    await this.db.transaction(async (tx) => {
      await tx
        .insert(afiliados)
        .values(registros.map((r) => r.persona))
        .onConflictDoNothing({ target: afiliados.rut });

      const personas = await tx
        .select({ id: afiliados.id, rut: afiliados.rut })
        .from(afiliados)
        .where(inArray(afiliados.rut, Array.from(rutsValidos)));
      const idPorRut = new Map(personas.map((p) => [p.rut, p.id]));

      const relaciones = await tx
        .insert(planesAfiliado)
        .values(
          registros.map((r) => ({
            afiliadoId: idPorRut.get(r.persona.rut)!,
            codPlan,
            fechaInicio: r.fechaInicio ?? sql`${hoyChile}`,
            fechaTermino: r.fechaTermino,
            vigencia: "Activo" as const,
          })),
        )
        .onConflictDoUpdate({
          target: [planesAfiliado.afiliadoId, planesAfiliado.codPlan],
          set: {
            fechaTermino: sql`excluded.fecha_termino`,
            vigencia: "Activo",
            updatedAt: new Date(),
          },
        })
        .returning({ id: planesAfiliado.id, isNew: sql<boolean>`xmax = 0` });

      resultado.insertados = relaciones.filter((r) => r.isNew).length;
      resultado.actualizados = relaciones.length - resultado.insertados;

      if (tipo === "STOCK") {
        const terminadas = await tx
          .update(planesAfiliado)
          .set({ fechaTermino: sql`${hoyChile}`, vigencia: "Eliminado", updatedAt: new Date() })
          .where(
            and(
              eq(planesAfiliado.codPlan, codPlan),
              notInArray(planesAfiliado.afiliadoId, Array.from(idPorRut.values())),
              ne(planesAfiliado.vigencia, "Eliminado"),
            ),
          )
          .returning({ id: planesAfiliado.id });
        resultado.eliminados = terminadas.length;
      }
    });

    resultado.duracionMs = Date.now() - inicio;
    this.logger.log(
      `Carga ${tipo} plan=${codPlan}: ins=${resultado.insertados} upd=${resultado.actualizados} del=${resultado.eliminados} err=${resultado.errores.length} ${resultado.duracionMs}ms`,
    );
    await this.notificar(resultado);
    return resultado;
  }

  private async validarPlan(codPlan: string) {
    const [plan] = await this.db.select({ codPlan: planes.codPlan }).from(planes).where(eq(planes.codPlan, codPlan));
    if (!plan) throw new NotFoundException(`Plan ${codPlan} no existe`);
  }

  private leerCsv(csvBuffer: Buffer): Fila[] {
    try {
      return parse(csvBuffer, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
      }) as Fila[];
    } catch (err) {
      throw new BadRequestException(`CSV inválido: ${err instanceof Error ? err.message : err}`);
    }
  }

  private resultadoVacio(entidad: EntidadCargaMasiva, tipo: TipoCargaMasiva, codPlan: string, total: number): CargaMasivaResultado {
    return { entidad, tipo, codPlan, totalRegistros: total, insertados: 0, actualizados: 0, eliminados: 0, errores: [], duracionMs: 0 };
  }

  // Titulares con relación RUT–Plan no eliminada en el plan, por RUT normalizado.
  private async titularesDelPlan(codPlan: string, ruts: string[]): Promise<Map<string, string>> {
    if (ruts.length === 0) return new Map();
    const rows = await this.db
      .select({ rut: afiliados.rut, id: afiliados.id })
      .from(planesAfiliado)
      .innerJoin(afiliados, eq(afiliados.id, planesAfiliado.afiliadoId))
      .where(and(eq(planesAfiliado.codPlan, codPlan), inArray(afiliados.rut, ruts), ne(planesAfiliado.vigencia, "Eliminado")));
    return new Map(rows.map((r) => [r.rut, r.id]));
  }

  private fechasInvalidas(f: Fila, campos: string[]): string | null {
    for (const c of campos) if (f[c] && !FECHA.test(f[c]!)) return `${c} debe tener formato AAAA-MM-DD`;
    return null;
  }

  /**
   * Cargas (familiares) por RUT–Plan del titular (Anexo §III). Columnas obligatorias:
   * rut_titular, rut, nombres, apellido_paterno; opcionales apellido_materno, parentesco,
   * fecha_nacimiento, fecha_inicio, fecha_termino. FLUJO agrega o actualiza; STOCK además
   * termina las cargas del plan que no vienen en el archivo.
   */
  async cargarCargas(codPlan: string, tipo: TipoCargaMasiva, csvBuffer: Buffer): Promise<CargaMasivaResultado> {
    const inicio = Date.now();
    await this.validarPlan(codPlan);
    const filas = this.leerCsv(csvBuffer);
    const r = this.resultadoVacio("cargas", tipo, codPlan, filas.length);
    const parentescos = new Map<string, string>();
    for (const [k, v] of Object.entries(PARENTESCO_LABEL)) {
      parentescos.set(k.toLowerCase(), k);
      parentescos.set(v.toLowerCase(), k);
    }
    const validas: { fila: number; titular: string; rut: string; f: Fila; parentesco: string | null }[] = [];
    const vistos = new Set<string>();
    filas.forEach((f, i) => {
      const fila = i + 2;
      const error = (mensaje: string) => r.errores.push({ fila, mensaje });
      if (!f.rut_titular || !rutValido(f.rut_titular)) return error(`RUT titular inválido: ${f.rut_titular ?? ""}`);
      if (!f.rut || !rutValido(f.rut)) return error(`RUT de la carga inválido: ${f.rut ?? ""}`);
      if (!f.nombres || !f.apellido_paterno) return error("nombres y apellido_paterno son obligatorios");
      const fechas = this.fechasInvalidas(f, ["fecha_nacimiento", "fecha_inicio", "fecha_termino"]);
      if (fechas) return error(fechas);
      const parentesco = f.parentesco ? (parentescos.get(f.parentesco.toLowerCase()) ?? null) : null;
      if (f.parentesco && !parentesco) return error(`Parentesco inválido: ${f.parentesco} (${ParentescoEnum.options.join(", ")})`);
      const titular = formatearRut(f.rut_titular);
      const rut = formatearRut(f.rut);
      if (vistos.has(`${titular}|${rut}`)) return error(`Carga duplicada en archivo: ${rut}`);
      vistos.add(`${titular}|${rut}`);
      validas.push({ fila, titular, rut, f, parentesco });
    });
    const titulares = await this.titularesDelPlan(codPlan, [...new Set(validas.map((v) => v.titular))]);
    const registros = validas.filter((v) => {
      if (titulares.has(v.titular)) return true;
      r.errores.push({ fila: v.fila, mensaje: `El titular ${v.titular} no está en la nómina del plan ${codPlan}` });
      return false;
    });

    await this.db.transaction(async (tx) => {
      const filasDb = registros.length
        ? await tx
            .insert(cargasAfiliado)
            .values(
              registros.map((v) => ({
                afiliadoId: titulares.get(v.titular)!,
                codPlan,
                rut: v.rut,
                nombres: v.f.nombres!,
                apellidoPaterno: v.f.apellido_paterno!,
                apellidoMaterno: v.f.apellido_materno || null,
                parentesco: v.parentesco as (typeof cargasAfiliado.$inferInsert)["parentesco"],
                fechaNacimiento: v.f.fecha_nacimiento || null,
                fechaInicio: v.f.fecha_inicio || sql`${hoyChile}`,
                fechaTermino: v.f.fecha_termino || null,
                vigencia: "Activo" as const,
              })),
            )
            .onConflictDoUpdate({
              target: [cargasAfiliado.afiliadoId, cargasAfiliado.codPlan, cargasAfiliado.rut],
              set: {
                nombres: sql`excluded.nombres`,
                apellidoPaterno: sql`excluded.apellido_paterno`,
                apellidoMaterno: sql`excluded.apellido_materno`,
                parentesco: sql`excluded.parentesco`,
                fechaNacimiento: sql`excluded.fecha_nacimiento`,
                fechaTermino: sql`excluded.fecha_termino`,
                vigencia: "Activo",
                updatedAt: new Date(),
              },
            })
            .returning({ id: cargasAfiliado.id, isNew: sql<boolean>`xmax = 0` })
        : [];
      r.insertados = filasDb.filter((x) => x.isNew).length;
      r.actualizados = filasDb.length - r.insertados;
      if (tipo === "STOCK") {
        const terminadas = await tx
          .update(cargasAfiliado)
          .set({ fechaTermino: sql`${hoyChile}`, vigencia: "Eliminado", updatedAt: new Date() })
          .where(
            and(
              eq(cargasAfiliado.codPlan, codPlan),
              ne(cargasAfiliado.vigencia, "Eliminado"),
              filasDb.length ? notInArray(cargasAfiliado.id, filasDb.map((x) => x.id)) : undefined,
            ),
          )
          .returning({ id: cargasAfiliado.id });
        r.eliminados = terminadas.length;
      }
    });
    r.duracionMs = Date.now() - inicio;
    await this.notificar(r);
    return r;
  }

  /**
   * Bienes cubiertos por RUT–Plan (Anexo §III). Columnas obligatorias: rut_titular, tipo
   * (Inmueble, Vehiculo, Otro), identificador (rol, patente…); opcionales descripcion, comuna,
   * fecha_inicio, fecha_termino. Mismas reglas FLUJO/STOCK que las cargas.
   */
  async cargarBienes(codPlan: string, tipo: TipoCargaMasiva, csvBuffer: Buffer): Promise<CargaMasivaResultado> {
    const inicio = Date.now();
    await this.validarPlan(codPlan);
    const filas = this.leerCsv(csvBuffer);
    const r = this.resultadoVacio("bienes", tipo, codPlan, filas.length);
    type TipoBien = (typeof TipoBienEnum.options)[number];
    const tipos = new Map<string, TipoBien>(TipoBienEnum.options.map((t) => [t.toLowerCase(), t]));
    tipos.set("vehículo", "Vehiculo");
    const validas: { fila: number; titular: string; tipo: TipoBien; identificador: string; f: Fila }[] = [];
    const vistos = new Set<string>();
    filas.forEach((f, i) => {
      const fila = i + 2;
      const error = (mensaje: string) => r.errores.push({ fila, mensaje });
      if (!f.rut_titular || !rutValido(f.rut_titular)) return error(`RUT titular inválido: ${f.rut_titular ?? ""}`);
      const t = f.tipo ? tipos.get(f.tipo.toLowerCase()) : undefined;
      if (!t) return error(`Tipo de bien inválido: ${f.tipo ?? ""} (${TipoBienEnum.options.join(", ")})`);
      if (!f.identificador) return error("identificador es obligatorio");
      const fechas = this.fechasInvalidas(f, ["fecha_inicio", "fecha_termino"]);
      if (fechas) return error(fechas);
      const titular = formatearRut(f.rut_titular);
      const identificador = f.identificador.trim().toUpperCase();
      const clave = `${titular}|${t}|${identificador}`;
      if (vistos.has(clave)) return error(`Bien duplicado en archivo: ${identificador}`);
      vistos.add(clave);
      validas.push({ fila, titular, tipo: t, identificador, f });
    });
    const titulares = await this.titularesDelPlan(codPlan, [...new Set(validas.map((v) => v.titular))]);
    const registros = validas.filter((v) => {
      if (titulares.has(v.titular)) return true;
      r.errores.push({ fila: v.fila, mensaje: `El titular ${v.titular} no está en la nómina del plan ${codPlan}` });
      return false;
    });

    await this.db.transaction(async (tx) => {
      const filasDb = registros.length
        ? await tx
            .insert(bienesAfiliado)
            .values(
              registros.map((v) => ({
                afiliadoId: titulares.get(v.titular)!,
                codPlan,
                tipo: v.tipo,
                identificador: v.identificador,
                descripcion: v.f.descripcion || null,
                comuna: v.f.comuna || null,
                fechaInicio: v.f.fecha_inicio || sql`${hoyChile}`,
                fechaTermino: v.f.fecha_termino || null,
                vigencia: "Activo" as const,
              })),
            )
            .onConflictDoUpdate({
              target: [bienesAfiliado.afiliadoId, bienesAfiliado.codPlan, bienesAfiliado.tipo, bienesAfiliado.identificador],
              set: {
                descripcion: sql`excluded.descripcion`,
                comuna: sql`excluded.comuna`,
                fechaTermino: sql`excluded.fecha_termino`,
                vigencia: "Activo",
                updatedAt: new Date(),
              },
            })
            .returning({ id: bienesAfiliado.id, isNew: sql<boolean>`xmax = 0` })
        : [];
      r.insertados = filasDb.filter((x) => x.isNew).length;
      r.actualizados = filasDb.length - r.insertados;
      if (tipo === "STOCK") {
        const terminadas = await tx
          .update(bienesAfiliado)
          .set({ fechaTermino: sql`${hoyChile}`, vigencia: "Eliminado", updatedAt: new Date() })
          .where(
            and(
              eq(bienesAfiliado.codPlan, codPlan),
              ne(bienesAfiliado.vigencia, "Eliminado"),
              filasDb.length ? notInArray(bienesAfiliado.id, filasDb.map((x) => x.id)) : undefined,
            ),
          )
          .returning({ id: bienesAfiliado.id });
        r.eliminados = terminadas.length;
      }
    });
    r.duracionMs = Date.now() - inicio;
    await this.notificar(r);
    return r;
  }

  // Aviso en la aplicación a quienes ejecutan cargas (el correo a operaciones@ queda para SES).
  private async notificar(r: CargaMasivaResultado): Promise<void> {
    const destinatarios = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
      .where(
        and(
          eq(usuarios.activo, true),
          eq(usuarios.bloqueado, false),
          sql`(${perfiles.codigo} = ${PERFIL_ADMIN} or exists (select 1 from ${perfilPermisos} pp where pp.perfil_id = ${perfiles.id} and pp.permiso = 'cargas.ejecutar'))`,
        ),
      );
    await this.notif.crearBulk(
      destinatarios.map((u) => ({
        codPlan: r.codPlan,
        usuarioId: u.id,
        severidad: r.errores.length ? ("warn" as const) : ("info" as const),
        titulo: `Carga ${r.tipo} de ${r.entidad} del plan ${r.codPlan} terminada`,
        detalle: `${r.insertados} nuevos, ${r.actualizados} actualizados, ${r.eliminados} terminados, ${r.errores.length} con error`,
        accionUrl: "/cargas-masivas",
        metadata: { carga: { entidad: r.entidad, tipo: r.tipo, insertados: r.insertados, actualizados: r.actualizados, eliminados: r.eliminados, errores: r.errores.length } },
      })),
    );
  }

  // Reporte de la carga (Anexo §III: resumen y filas con error en XLSX).
  async resumenXlsx(r: CargaMasivaResultado): Promise<Buffer> {
    type Dato = [string, string | number];
    type ErrorCarga = CargaMasivaResultado["errores"][number];
    const resumen: Dato[] = [
      ["Entidad", r.entidad],
      ["Modalidad", r.tipo],
      ["Plan", r.codPlan],
      ["Registros en archivo", r.totalRegistros],
      ["Nuevos", r.insertados],
      ["Actualizados", r.actualizados],
      ["Terminados (stock)", r.eliminados],
      ["Con error", r.errores.length],
    ];
    return libroXlsx([
      {
        nombre: "Resumen",
        columnas: [
          { titulo: "Dato", valor: (x: Dato) => x[0], ancho: 24 },
          { titulo: "Valor", valor: (x: Dato) => x[1], ancho: 16 },
        ],
        filas: resumen,
      },
      {
        nombre: "Errores",
        columnas: [
          { titulo: "Fila", valor: (e: ErrorCarga) => e.fila },
          { titulo: "Error", valor: (e: ErrorCarga) => e.mensaje, ancho: 70 },
        ],
        filas: r.errores,
      },
    ]);
  }
}

type Fila = Record<string, string | undefined>;
