import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, gt, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import {
  MAX_FILAS_EXPORTACION,
  TIPO_CITA_LABEL,
  TIPOS_CITA_JUDICIAL,
  alcanceAtenciones,
  type ActualizarCita,
  type CambiarEstadoCita,
  type Cita,
  type CrearCita,
  type FiltroAgenda,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { citas } from "../../db/schema/agenda";
import { atenciones } from "../../db/schema/atenciones";
import { afiliados } from "../../db/schema/afiliados";
import { perfilPermisos, perfiles, usuarios } from "../../db/schema/usuarios";
import { accesoActual } from "../../common/acceso/contexto";
import { asegurarAtencionVisible } from "../../common/acceso/alcance";
import { instanteChile } from "../../common/utils/dias-habiles";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";
import { libroXlsx } from "../exports/xlsx";

const responsable = alias(usuarios, "responsable");
const autor = alias(usuarios, "autor");

const fechaHora = (d: Date) => d.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

// Citas que el usuario actual ve: las suyas (responsable o creadas por él), las de su equipo
// (atenciones.ver_equipo) o todas (atenciones.ver_todas). Sin contexto, sin restricción.
export function filtroCitas(): SQL | undefined {
  const acceso = accesoActual();
  if (!acceso) return undefined;
  const alcance = alcanceAtenciones(acceso.permisos);
  if (alcance === "todas") return undefined;
  const yo = acceso.usuarioId;
  const condiciones: SQL[] = [eq(citas.responsableId, yo), eq(citas.creadoPorId, yo)];
  if (alcance === "equipo") condiciones.push(sql`${citas.responsableId} in (select u.id from usuarios u where u.jefe_id = ${yo})`);
  return or(...condiciones);
}

@Injectable()
export class AgendaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
  ) {}

  async listar(f: FiltroAgenda): Promise<Cita[]> {
    // El período es por día calendario de Chile: [desde 00:00, hasta+1 00:00).
    const desde = instanteChile(f.desde, "00:00");
    const siguiente = new Date(`${f.hasta}T12:00:00Z`);
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    const hasta = instanteChile(siguiente.toISOString().slice(0, 10), "00:00");
    return this.filas(
      and(
        filtroCitas(),
        lt(citas.inicio, hasta),
        gt(citas.fin, desde),
        f.responsableId ? eq(citas.responsableId, f.responsableId) : undefined,
        f.tipo?.length ? inArray(citas.tipo, f.tipo) : undefined,
        f.estado ? eq(citas.estado, f.estado) : undefined,
        f.atencionId ? eq(citas.atencionId, f.atencionId) : undefined,
      ),
    );
  }

  async obtener(id: string): Promise<Cita> {
    const [c] = await this.filas(and(eq(citas.id, id), filtroCitas()));
    if (!c) throw new NotFoundException(`Cita ${id} no existe`);
    return c;
  }

  async crear(input: CrearCita, actorId: string): Promise<Cita> {
    let codPlan: string | null = null;
    let afiliadoId = input.afiliadoId ?? null;
    let abogadoDeAtencion: string | null = null;
    if (input.atencionId) {
      await asegurarAtencionVisible(this.db, input.atencionId);
      const [a] = await this.db
        .select({ codPlan: atenciones.codPlan, afiliadoId: atenciones.afiliadoId, abogado: atenciones.abogadoAsignadoId })
        .from(atenciones)
        .where(eq(atenciones.id, input.atencionId));
      codPlan = a.codPlan;
      abogadoDeAtencion = a.abogado;
      if (afiliadoId && afiliadoId !== a.afiliadoId) throw new BadRequestException("El afiliado no corresponde a la atención");
      afiliadoId = a.afiliadoId;
    } else if (afiliadoId) {
      const [af] = await this.db.select({ id: afiliados.id }).from(afiliados).where(eq(afiliados.id, afiliadoId));
      if (!af) throw new BadRequestException("El afiliado no existe");
    }
    await this.validarResponsable(input.responsableId, abogadoDeAtencion);
    await this.sinTopes(input.responsableId, new Date(input.inicio), new Date(input.fin));
    const [row] = await this.db
      .insert(citas)
      .values({
        tipo: input.tipo,
        titulo: input.titulo,
        inicio: new Date(input.inicio),
        fin: new Date(input.fin),
        lugar: input.lugar ?? null,
        notas: input.notas ?? null,
        responsableId: input.responsableId,
        atencionId: input.atencionId ?? null,
        afiliadoId,
        creadoPorId: actorId,
      })
      .returning();
    const cita = await this.obtenerSinAlcance(row.id);
    await this.avisar(cita, codPlan, actorId, "agendada");
    return cita;
  }

  async actualizar(id: string, input: ActualizarCita, actorId: string): Promise<Cita> {
    const actual = await this.obtener(id);
    if (actual.estado !== "Programada") throw new BadRequestException(`La cita está ${actual.estado.toLowerCase()}; no se puede modificar`);
    const inicio = input.inicio ? new Date(input.inicio) : new Date(actual.inicio);
    const fin = input.fin ? new Date(input.fin) : new Date(actual.fin);
    if (fin <= inicio) throw new BadRequestException("El término debe ser posterior al inicio");
    const responsableId = input.responsableId ?? actual.responsableId;
    if (input.responsableId && input.responsableId !== actual.responsableId) {
      let abogado: string | null = null;
      if (actual.atencionId) {
        const [a] = await this.db.select({ abogado: atenciones.abogadoAsignadoId }).from(atenciones).where(eq(atenciones.id, actual.atencionId));
        abogado = a?.abogado ?? null;
      }
      await this.validarResponsable(input.responsableId, abogado);
    }
    await this.sinTopes(responsableId, inicio, fin, id);
    const [row] = await this.db
      .update(citas)
      .set({
        ...(input.tipo ? { tipo: input.tipo } : {}),
        ...(input.titulo ? { titulo: input.titulo } : {}),
        ...(input.lugar !== undefined ? { lugar: input.lugar } : {}),
        ...(input.notas !== undefined ? { notas: input.notas } : {}),
        inicio,
        fin,
        responsableId,
        updatedAt: new Date(),
      })
      .where(and(eq(citas.id, id), eq(citas.estado, "Programada")))
      .returning({ id: citas.id });
    if (!row) throw new ConflictException("La cita cambió de estado; recargue");
    const cita = await this.obtenerSinAlcance(id);
    if (cita.inicio !== actual.inicio || cita.responsableId !== actual.responsableId) {
      await this.avisar(cita, await this.planDe(cita.atencionId), actorId, "reprogramada");
    }
    return cita;
  }

  async cambiarEstado(id: string, input: CambiarEstadoCita, actorId: string): Promise<Cita> {
    const actual = await this.obtener(id);
    const [row] = await this.db
      .update(citas)
      .set({ estado: input.estado, ...(input.notas !== undefined ? { notas: input.notas } : {}), updatedAt: new Date() })
      .where(and(eq(citas.id, id), eq(citas.estado, "Programada")))
      .returning({ id: citas.id });
    if (!row) throw new ConflictException(`La cita ya está ${actual.estado.toLowerCase()}`);
    const cita = await this.obtenerSinAlcance(id);
    if (input.estado === "Cancelada") await this.avisar(cita, await this.planDe(cita.atencionId), actorId, "cancelada");
    return cita;
  }

  // Calendario (p. ej. mensual de audiencias) en Excel, con el mismo filtro y alcance.
  async xlsx(f: FiltroAgenda): Promise<Buffer> {
    const filas = await this.listar(f);
    if (filas.length > MAX_FILAS_EXPORTACION) throw new BadRequestException(`Más de ${MAX_FILAS_EXPORTACION} citas; acote el período`);
    return libroXlsx([
      {
        nombre: "Agenda",
        columnas: [
          { titulo: "Inicio", valor: (c: Cita) => fechaHora(new Date(c.inicio)), ancho: 18 },
          { titulo: "Término", valor: (c: Cita) => fechaHora(new Date(c.fin)), ancho: 18 },
          { titulo: "Tipo", valor: (c: Cita) => TIPO_CITA_LABEL[c.tipo] },
          { titulo: "Título", valor: (c: Cita) => c.titulo, ancho: 32 },
          { titulo: "Lugar", valor: (c: Cita) => c.lugar ?? "", ancho: 28 },
          { titulo: "Responsable", valor: (c: Cita) => c.responsableNombre, ancho: 24 },
          { titulo: "Atención", valor: (c: Cita) => c.atencionCorrelativo ?? "", ancho: 20 },
          { titulo: "RUT afiliado", valor: (c: Cita) => c.afiliadoRut ?? "" },
          { titulo: "Afiliado", valor: (c: Cita) => c.afiliadoNombre ?? "", ancho: 26 },
          { titulo: "Estado", valor: (c: Cita) => c.estado },
        ],
        filas,
      },
    ]);
  }

  // El responsable debe estar activo y dentro del alcance de quien agenda (él mismo, su equipo
  // o cualquiera con ver_todas), o ser el abogado asignado de la atención.
  private async validarResponsable(responsableId: string, abogadoDeAtencion: string | null) {
    const [u] = await this.db
      .select({ id: usuarios.id, jefeId: usuarios.jefeId })
      .from(usuarios)
      .where(and(eq(usuarios.id, responsableId), eq(usuarios.activo, true)));
    if (!u) throw new BadRequestException("El responsable no existe o no está activo");
    const acceso = accesoActual();
    if (!acceso || responsableId === acceso.usuarioId || responsableId === abogadoDeAtencion) return;
    const alcance = alcanceAtenciones(acceso.permisos);
    if (alcance === "todas" || (alcance === "equipo" && u.jefeId === acceso.usuarioId)) return;
    throw new BadRequestException("Solo puede agendar para usted, su equipo o el abogado de la atención");
  }

  // Un responsable no tiene dos citas programadas que se crucen.
  private async sinTopes(responsableId: string, inicio: Date, fin: Date, excepto?: string) {
    const [tope] = await this.db
      .select({ titulo: citas.titulo, inicio: citas.inicio })
      .from(citas)
      .where(
        and(
          eq(citas.responsableId, responsableId),
          eq(citas.estado, "Programada"),
          lt(citas.inicio, fin),
          gt(citas.fin, inicio),
          excepto ? ne(citas.id, excepto) : undefined,
        ),
      )
      .limit(1);
    if (tope) throw new ConflictException(`El responsable ya tiene "${tope.titulo}" el ${fechaHora(tope.inicio)}`);
  }

  private async planDe(atencionId: string | null): Promise<string | null> {
    if (!atencionId) return null;
    const [a] = await this.db.select({ codPlan: atenciones.codPlan }).from(atenciones).where(eq(atenciones.id, atencionId));
    return a?.codPlan ?? null;
  }

  // Aviso al responsable (si no agendó él) y, en audiencias y comparendos, a quienes llevan el
  // calendario mensual (permiso agenda.calendario_audiencias asignado al perfil).
  private async avisar(c: Cita, codPlan: string | null, actorId: string, accion: string) {
    const destinatarios = new Set<string>();
    if (c.responsableId !== actorId) destinatarios.add(c.responsableId);
    if (TIPOS_CITA_JUDICIAL.includes(c.tipo)) {
      const calendario = await this.db
        .select({ id: usuarios.id })
        .from(usuarios)
        .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
        .innerJoin(perfilPermisos, eq(perfilPermisos.perfilId, perfiles.id))
        .where(and(eq(usuarios.activo, true), eq(perfilPermisos.permiso, "agenda.calendario_audiencias")));
      for (const u of calendario) if (u.id !== actorId) destinatarios.add(u.id);
    }
    if (!destinatarios.size) return;
    await this.notif.crearBulk(
      [...destinatarios].map((usuarioId) => ({
        codPlan,
        usuarioId,
        severidad: c.tipo === "Audiencia" || c.tipo === "Comparendo" ? ("warn" as const) : ("info" as const),
        titulo: `${TIPO_CITA_LABEL[c.tipo]} ${accion}: ${c.titulo}`,
        detalle: `${fechaHora(new Date(c.inicio))}${c.lugar ? ` · ${c.lugar}` : ""} · ${c.responsableNombre}`,
        accionUrl: `/agenda?fecha=${c.inicio.slice(0, 10)}`,
        metadata: { citaId: c.id },
      })),
    );
  }

  private async obtenerSinAlcance(id: string): Promise<Cita> {
    const [c] = await this.filas(eq(citas.id, id));
    return c;
  }

  private async filas(where: SQL | undefined): Promise<Cita[]> {
    const rows = await this.db
      .select({
        c: citas,
        responsableNombre: responsable.nombre,
        creadoPorNombre: autor.nombre,
        atencionCorrelativo: atenciones.correlativo,
        afiliadoNombre: sql<string | null>`${afiliados.nombres} || ' ' || ${afiliados.apellidoPaterno}`,
        afiliadoRut: afiliados.rut,
      })
      .from(citas)
      .innerJoin(responsable, eq(responsable.id, citas.responsableId))
      .innerJoin(autor, eq(autor.id, citas.creadoPorId))
      .leftJoin(atenciones, eq(atenciones.id, citas.atencionId))
      .leftJoin(afiliados, eq(afiliados.id, citas.afiliadoId))
      .where(where)
      .orderBy(asc(citas.inicio))
      .limit(MAX_FILAS_EXPORTACION + 1);
    return rows.map(({ c, ...r }) => ({
      id: c.id,
      tipo: c.tipo,
      titulo: c.titulo,
      inicio: c.inicio.toISOString(),
      fin: c.fin.toISOString(),
      lugar: c.lugar,
      estado: c.estado,
      notas: c.notas,
      responsableId: c.responsableId,
      responsableNombre: r.responsableNombre,
      atencionId: c.atencionId,
      atencionCorrelativo: r.atencionCorrelativo,
      afiliadoId: c.afiliadoId,
      afiliadoNombre: r.afiliadoNombre,
      afiliadoRut: r.afiliadoRut,
      creadoPorNombre: r.creadoPorNombre,
      createdAt: c.createdAt.toISOString(),
    }));
  }
}
