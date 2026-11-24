import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CorreosService } from "../correos/correos.service";
import { plantillaAviso } from "../correos/plantillas";
import { jefeDe } from "../notif-inbox/destinatarios";
import { Cron } from "@nestjs/schedule";
import { and, eq, inArray, isNull, min, notInArray, sql } from "drizzle-orm";
import {
  ESTADOS_TERMINALES,
  PLAZO_CONTACTO_DIAS_HABILES,
  PLAZO_PRIMERA_PRESENTACION_DIAS_HABILES,
  PLAZO_RENDICION_DIAS_HABILES,
  PLAZO_SOLICITUD_ANTECEDENTES_DIAS_HABILES,
  TIPO_PLAZO_LABEL,
  type EstadoArancelAtencion,
  type EstadoPlazo,
  type PlazoAtencion,
  type TipoAtencion,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { atenciones } from "../../db/schema/atenciones";
import { gestiones } from "../../db/schema/gestiones";
import { provisiones } from "../../db/schema/provisiones";
import { arancelesAtencion } from "../../db/schema/finanzas";
import { asegurarAtencionVisible } from "../../common/acceso/alcance";
import { finDeDiaChile, hoyChileISO, sumarDiasHabiles } from "../../common/utils/dias-habiles";
import { NotifInboxService } from "../notif-inbox/notif-inbox.service";

export interface DatosPlazos {
  tipo: TipoAtencion;
  creadaEn: Date;
  fechaPrimerContacto: Date | null;
  antecedentesFaltantesDesde?: Date | null;
  antecedentesSolicitadosEn?: Date | null;
  arancel: { estado: EstadoArancelAtencion; fechaPago: string | null; creadoEn: Date } | null;
  primerEscritoEn: Date | null;
  provisiones: { id: string; fechaEntrega: Date | null; fechaRendicion: Date | null }[];
}

const TIPOS_CON_PLAZOS: TipoAtencion[] = ["Asesoria", "Juicio"];

function plazo(
  tipo: PlazoAtencion["tipo"],
  desde: Date,
  diasHabiles: number,
  cumplidoEn: Date | null,
  ahora: Date,
  referenciaId?: string,
): PlazoAtencion {
  const limite = finDeDiaChile(sumarDiasHabiles(hoyChileISO(desde), diasHabiles));
  const estado: EstadoPlazo = cumplidoEn
    ? cumplidoEn <= limite
      ? "Cumplido"
      : "CumplidoFueraDePlazo"
    : ahora > limite
      ? "Vencido"
      : "Pendiente";
  return {
    tipo,
    desde: desde.toISOString(),
    limite: limite.toISOString(),
    cumplidoEn: cumplidoEn?.toISOString() ?? null,
    estado,
    ...(referenciaId ? { referenciaId } : {}),
  };
}

// Plazos del Anexo para una asesoría o un juicio. Solo aparecen los que ya empezaron a correr.
export function calcularPlazos(d: DatosPlazos, ahora: Date = new Date()): PlazoAtencion[] {
  if (!TIPOS_CON_PLAZOS.includes(d.tipo)) return [];
  const lista = [plazo("ContactoCliente", d.creadaEn, PLAZO_CONTACTO_DIAS_HABILES, d.fechaPrimerContacto, ahora)];
  if (d.tipo === "Juicio" && d.arancel) {
    // Corre desde el pago del arancel (o desde que se determinó que no se requiere).
    const desde =
      d.arancel.estado === "Pagado" && d.arancel.fechaPago
        ? new Date(`${d.arancel.fechaPago}T12:00:00Z`)
        : d.arancel.estado === "NoRequerido"
          ? d.arancel.creadoEn
          : null;
    if (desde) lista.push(plazo("PrimeraPresentacion", desde, PLAZO_PRIMERA_PRESENTACION_DIAS_HABILES, d.primerEscritoEn, ahora));
  }
  // Solo la última vez que faltaron antecedentes: una solicitud anterior no la cumple.
  if (d.antecedentesFaltantesDesde) {
    const pedido = d.antecedentesSolicitadosEn && d.antecedentesSolicitadosEn >= d.antecedentesFaltantesDesde ? d.antecedentesSolicitadosEn : null;
    lista.push(plazo("SolicitudAntecedentes", d.antecedentesFaltantesDesde, PLAZO_SOLICITUD_ANTECEDENTES_DIAS_HABILES, pedido, ahora));
  }
  for (const p of d.provisiones) {
    if (p.fechaEntrega) lista.push(plazo("RendicionFondos", p.fechaEntrega, PLAZO_RENDICION_DIAS_HABILES, p.fechaRendicion, ahora, p.id));
  }
  return lista;
}

@Injectable()
export class PlazosService {
  private readonly logger = new Logger(PlazosService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotifInboxService) private readonly notif: NotifInboxService,
    @Optional() @Inject(CorreosService) private readonly correos?: CorreosService,
  ) {}

  async deAtencion(atencionId: string): Promise<PlazoAtencion[]> {
    await asegurarAtencionVisible(this.db, atencionId);
    const [d] = await this.datos([atencionId]);
    return d ? calcularPlazos(d.datos) : [];
  }

  // Primer contacto registrado a mano (llamada no registrada como gestión, entrevista, etc.).
  // No retrocede uno anterior ya registrado.
  async registrarContacto(atencionId: string, fecha?: string): Promise<PlazoAtencion[]> {
    await asegurarAtencionVisible(this.db, atencionId);
    const momento = fecha ? new Date(fecha) : new Date();
    await this.db
      .update(atenciones)
      .set({ fechaPrimerContacto: momento, updatedAt: new Date() })
      .where(
        and(
          eq(atenciones.id, atencionId),
          sql`(${atenciones.fechaPrimerContacto} is null or ${atenciones.fechaPrimerContacto} > ${momento})`,
        ),
      );
    return this.deAtencion(atencionId);
  }

  private async datos(ids: string[]) {
    if (!ids.length) return [];
    const [filas, aranceles, escritos, provs] = await Promise.all([
      this.db
        .select({
          id: atenciones.id,
          tipo: atenciones.tipo,
          createdAt: atenciones.createdAt,
          fechaPrimerContacto: atenciones.fechaPrimerContacto,
          antecedentesFaltantesDesde: atenciones.antecedentesFaltantesDesde,
          antecedentesSolicitadosEn: atenciones.antecedentesSolicitadosEn,
          correlativo: atenciones.correlativo,
          codPlan: atenciones.codPlan,
          responsableId: sql<string | null>`coalesce(${atenciones.abogadoAsignadoId}, ${atenciones.creadoPorId})`,
        })
        .from(atenciones)
        .where(inArray(atenciones.id, ids)),
      this.db
        .select({
          atencionId: arancelesAtencion.atencionId,
          estado: arancelesAtencion.estado,
          fechaPago: arancelesAtencion.fechaPago,
          createdAt: arancelesAtencion.createdAt,
        })
        .from(arancelesAtencion)
        .where(inArray(arancelesAtencion.atencionId, ids)),
      this.db
        .select({ atencionId: gestiones.atencionId, primero: min(gestiones.fechaEjecucion) })
        .from(gestiones)
        .where(and(inArray(gestiones.atencionId, ids), eq(gestiones.tipo, "EscritoJudicial"), eq(gestiones.estado, "Completada")))
        .groupBy(gestiones.atencionId),
      this.db
        .select({
          id: provisiones.id,
          atencionId: provisiones.atencionId,
          fechaEntrega: provisiones.fechaEntrega,
          fechaRendicion: provisiones.fechaRendicion,
        })
        .from(provisiones)
        .where(inArray(provisiones.atencionId, ids)),
    ]);
    return filas.map((a) => {
      const ar = aranceles.find((x) => x.atencionId === a.id);
      const escrito = escritos.find((x) => x.atencionId === a.id)?.primero ?? null;
      const datos: DatosPlazos = {
        tipo: a.tipo,
        creadaEn: a.createdAt,
        fechaPrimerContacto: a.fechaPrimerContacto,
        antecedentesFaltantesDesde: a.antecedentesFaltantesDesde,
        antecedentesSolicitadosEn: a.antecedentesSolicitadosEn,
        arancel: ar ? { estado: ar.estado, fechaPago: ar.fechaPago, creadoEn: ar.createdAt } : null,
        primerEscritoEn: escrito ? new Date(escrito) : null,
        provisiones: provs.filter((p) => p.atencionId === a.id),
      };
      return { atencion: a, datos };
    });
  }

  // Cada día hábil a las 08:30 de Chile (12:30 UTC aprox.): avisa al responsable de cada plazo
  // vencido sin cumplir. Una notificación por plazo mientras no la haya visto.
  @Cron("30 12 * * 1-5")
  async avisarVencidos(): Promise<number> {
    const abiertas = await this.db
      .select({ id: atenciones.id })
      .from(atenciones)
      .where(
        and(
          inArray(atenciones.tipo, TIPOS_CON_PLAZOS),
          notInArray(atenciones.estado, [...ESTADOS_TERMINALES]),
          isNull(atenciones.fechaCierre),
        ),
      );
    let avisos = 0;
    for (let i = 0; i < abiertas.length; i += 200) {
      for (const { atencion, datos } of await this.datos(abiertas.slice(i, i + 200).map((a) => a.id))) {
        if (!atencion.responsableId) continue;
        for (const p of calcularPlazos(datos).filter((x) => x.estado === "Vencido")) {
          const clave = `${atencion.id}:${p.tipo}:${p.referenciaId ?? ""}`;
          const creada = await this.notif.crearSiNoExisteUnseen(
            {
              codPlan: atencion.codPlan,
              usuarioId: atencion.responsableId,
              severidad: "critical",
              titulo: `Plazo vencido: ${TIPO_PLAZO_LABEL[p.tipo]} (${atencion.correlativo})`,
              detalle: `Venció el ${new Date(p.limite).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`,
              accionUrl: `/atenciones/${atencion.id}`,
              metadata: { plazoVencido: clave },
            },
            "plazoVencido",
            clave,
          );
          if (creada) avisos++;
          // Anexo §X l.1727: fondos por rendir vencidos también a la jefatura y por correo a ambos.
          if (creada && p.tipo === "RendicionFondos") await this.avisarRendicionVencida(atencion, p, clave);
        }
      }
    }
    if (avisos) this.logger.log(`Avisos de plazos vencidos: ${avisos}`);
    return avisos;
  }

  private async avisarRendicionVencida(
    atencion: { id: string; codPlan: string; correlativo: string; responsableId: string | null },
    p: PlazoAtencion,
    clave: string,
  ) {
    const jefe = await jefeDe(this.db, atencion.responsableId);
    const titulo = `Fondos por rendir vencidos (${atencion.correlativo})`;
    const detalle = `Venció el ${new Date(p.limite).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`;
    if (jefe && jefe !== atencion.responsableId) {
      await this.notif.crearSiNoExisteUnseen(
        { codPlan: atencion.codPlan, usuarioId: jefe, severidad: "warn", titulo, detalle, accionUrl: `/atenciones/${atencion.id}`, metadata: { plazoVencido: `${clave}:jefe` } },
        "plazoVencido",
        `${clave}:jefe`,
      );
    }
    if (this.correos) {
      await this.correos
        .aUsuarios([atencion.responsableId, jefe], plantillaAviso({ titulo, detalle, url: this.correos.url(`/atenciones/${atencion.id}`) }), {
          plantilla: "provision.rendicion_vencida",
          atencionId: atencion.id,
        })
        .catch((e) => this.logger.warn(`No se pudo enviar el correo de rendición vencida: ${e}`));
    }
  }
}
