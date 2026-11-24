import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, inArray } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { correosEnviados } from "../../db/schema/correos";
import { usuarios } from "../../db/schema/usuarios";
import { asegurarAtencionVisible } from "../../common/acceso/alcance";
import { NotificacionesService, type ResultadoEnvio } from "../notificaciones/notificaciones.service";
import type { Contenido } from "./plantillas";

// Casillas institucionales del Anexo (configurables; vacías = no se envía a esa casilla).
export type Casilla = "apruebaArancel" | "solicitudFondos" | "autorizaProvision" | "operaciones";
const VARIABLE: Record<Casilla, string> = {
  apruebaArancel: "CORREO_APRUEBA_ARANCEL",
  solicitudFondos: "CORREO_SOLICITUD_FONDOS",
  autorizaProvision: "CORREO_AUTORIZA_PROVISION",
  operaciones: "CORREO_OPERACIONES",
};

export interface OpcionesEnvio {
  plantilla: string;
  atencionId?: string | null;
  enviadoPorId?: string | null;
}

// Envío de correos de los flujos y bitácora (correos_enviados). Con SES desactivado el correo
// queda "Omitido" en la bitácora y en el log, sin salir.
@Injectable()
export class CorreosService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(NotificacionesService) private readonly ses: NotificacionesService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  casilla(c: Casilla): string | null {
    return this.config.get<string>(VARIABLE[c])?.trim() || null;
  }

  // URL de la ficha en la web (primer origen permitido).
  url(ruta: string): string {
    const base = (this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:4200").split(",")[0].trim().replace(/\/+$/, "");
    return `${base}${ruta}`;
  }

  async enviar(para: (string | null | undefined)[], contenido: Contenido, op: OpcionesEnvio): Promise<ResultadoEnvio | null> {
    const destinatarios = [...new Set(para.map((x) => x?.trim().toLowerCase()).filter((x): x is string => !!x && x.includes("@")))];
    if (!destinatarios.length) return null;
    const estado = await this.ses.enviarEmail({ to: destinatarios, subject: contenido.asunto, bodyHtml: contenido.html, bodyText: contenido.texto });
    await this.db.insert(correosEnviados).values({
      atencionId: op.atencionId ?? null,
      plantilla: op.plantilla,
      destinatarios,
      asunto: contenido.asunto.slice(0, 300),
      estado,
      enviadoPorId: op.enviadoPorId ?? null,
    });
    return estado;
  }

  // Correo a usuarios del sistema (activos) y a casillas institucionales, sin repetir ni incluir a
  // quien hizo la acción.
  async aUsuarios(
    usuarioIds: Iterable<string | null | undefined>,
    contenido: Contenido,
    op: OpcionesEnvio & { excluir?: string | null; casillas?: Casilla[] },
  ): Promise<ResultadoEnvio | null> {
    const ids = [...new Set([...usuarioIds].filter((x): x is string => !!x && x !== op.excluir))];
    const correos = ids.length
      ? (await this.db.select({ email: usuarios.email }).from(usuarios).where(and(inArray(usuarios.id, ids), eq(usuarios.activo, true)))).map((u) => u.email)
      : [];
    const casillas = (op.casillas ?? []).map((c) => this.casilla(c));
    return this.enviar([...correos, ...casillas], contenido, op);
  }

  async deAtencion(atencionId: string) {
    await asegurarAtencionVisible(this.db, atencionId);
    return this.db
      .select({
        id: correosEnviados.id,
        plantilla: correosEnviados.plantilla,
        destinatarios: correosEnviados.destinatarios,
        asunto: correosEnviados.asunto,
        estado: correosEnviados.estado,
        createdAt: correosEnviados.createdAt,
      })
      .from(correosEnviados)
      .where(eq(correosEnviados.atencionId, atencionId))
      .orderBy(desc(correosEnviados.createdAt))
      .limit(200);
  }
}
