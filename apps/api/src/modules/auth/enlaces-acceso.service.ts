import { escaparHtml } from "../../common/utils/html";
import { ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, gte, isNull, sql } from "drizzle-orm";
import {
  HORAS_VALIDEZ_SESION,
  MINUTOS_VALIDEZ_ENLACE,
  PERFIL_ADMIN,
  type SesionIniciada,
  type SolicitudEnlaceResultado,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { enlacesAcceso, perfiles, usuarios, type Usuario } from "../../db/schema/usuarios";
import { AuditService } from "../audit/audit.service";
import { NotificacionesService } from "../notificaciones/notificaciones.service";
import { UsuariosService, UsuarioNoHabilitadoError, esAdminBootstrap } from "../usuarios/usuarios.service";
import { dominioPermitido } from "./dominio";
import { firmarSesion } from "./sesion";

// Máximo de enlaces que un usuario puede pedir dentro de la ventana de validez.
export const MAX_ENLACES_POR_VENTANA = 3;

export interface OrigenSolicitud {
  ip?: string | null;
  userAgent?: string | null;
  // Header Origin del navegador: el enlace apunta al mismo frontend si está autorizado.
  origen?: string | null;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const modoDemo = () => process.env.AUTH_DISABLED === "true";

// URL base del frontend para el enlace: el Origin del request si está en WEB_ORIGIN, si no el primero.
export function baseFrontend(origen: string | null | undefined, config = process.env.WEB_ORIGIN): string {
  const permitidos = (config ?? "http://localhost:4200").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  const o = origen?.trim().replace(/\/+$/, "");
  return o && permitidos.includes(o) ? o : permitidos[0];
}

@Injectable()
export class EnlacesAccesoService {
  private readonly logger = new Logger(EnlacesAccesoService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(UsuariosService) private readonly usuarios: UsuariosService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificacionesService) private readonly notificaciones: NotificacionesService,
  ) {}

  // Siempre responde ok (aunque el correo no exista o no esté habilitado) para no revelar
  // qué cuentas existen. Solo usuarios activos y no bloqueados reciben un enlace.
  async solicitar(email: string, req: OrigenSolicitud = {}): Promise<SolicitudEnlaceResultado> {
    const correo = email.trim().toLowerCase();
    if (!modoDemo() && !dominioPermitido(correo)) return { ok: true };

    const usuario = (await this.buscarPorEmail(correo)) ?? (await this.crearAdminBootstrap(correo));
    if (!usuario || !usuario.activo || usuario.bloqueado) {
      if (usuario) await this.registrar(usuario, "ENLACE_ACCESO_DENEGADO", req, { motivo: usuario.bloqueado ? "bloqueado" : "inactivo" });
      return { ok: true };
    }

    const desde = new Date(Date.now() - MINUTOS_VALIDEZ_ENLACE * 60_000);
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(enlacesAcceso)
      .where(and(eq(enlacesAcceso.usuarioId, usuario.id), gte(enlacesAcceso.createdAt, desde)));
    // En demo no se limita por usuario (todos comparten las cuentas mock); el límite por IP sigue.
    if (!modoDemo() && n >= MAX_ENLACES_POR_VENTANA) {
      this.logger.warn(`Límite de enlaces de acceso alcanzado para usuario ${usuario.id}`);
      return { ok: true };
    }

    const token = randomBytes(32).toString("base64url");
    await this.db.insert(enlacesAcceso).values({
      usuarioId: usuario.id,
      tokenHash: hashToken(token),
      expiraEn: new Date(Date.now() + MINUTOS_VALIDEZ_ENLACE * 60_000),
      ip: req.ip?.slice(0, 64) ?? null,
      userAgent: req.userAgent ?? null,
    });
    const enlace = `${baseFrontend(req.origen)}/login/verificar?token=${encodeURIComponent(token)}`;
    await this.registrar(usuario, "ENLACE_ACCESO_SOLICITADO", req);

    // Demo sin correo: cualquiera ya entra como usuario mock, así que devolver el enlace no abre nada nuevo.
    if (modoDemo()) return { ok: true, enlaceDemo: enlace };
    await this.notificaciones.enviarEmail({
      to: [usuario.email],
      subject: "Tu enlace de acceso a Legal Chile",
      bodyHtml: correoHtml(usuario.nombre, enlace),
      bodyText: correoTexto(usuario.nombre, enlace),
    });
    return { ok: true };
  }

  // Canjea el enlace (una sola vez, antes de vencer) por un token de sesión.
  async verificar(token: string, req: OrigenSolicitud = {}): Promise<SesionIniciada> {
    const ahora = new Date();
    const [canjeado] = await this.db
      .update(enlacesAcceso)
      .set({ usadoEn: ahora })
      .where(and(eq(enlacesAcceso.tokenHash, hashToken(token)), isNull(enlacesAcceso.usadoEn), gt(enlacesAcceso.expiraEn, ahora)))
      .returning({ usuarioId: enlacesAcceso.usuarioId });
    if (!canjeado) throw new UnauthorizedException("El enlace no es válido, ya fue usado o venció. Solicite uno nuevo.");

    let user;
    try {
      user = await this.usuarios.contextoAcceso(canjeado.usuarioId);
    } catch (err) {
      if (err instanceof UsuarioNoHabilitadoError) {
        await this.registrar(err.usuario, "ACCESO_DENEGADO", req, { motivo: err.message });
        throw new ForbiddenException(err.message);
      }
      throw err;
    }
    if (!modoDemo() && !dominioPermitido(user.email)) {
      throw new ForbiddenException("Su cuenta no pertenece a un dominio autorizado de LegalChile");
    }

    await this.db.update(usuarios).set({ ultimoLogin: ahora }).where(eq(usuarios.id, user.id));
    await this.registrar(user, "LOGIN_ENLACE", req);
    const sesion = firmarSesion(user.id, HORAS_VALIDEZ_SESION, undefined, undefined, user.sesionVersion);
    return { token: sesion.token, expiraEn: sesion.expiraEn.toISOString() };
  }

  private async buscarPorEmail(correo: string): Promise<Usuario | null> {
    const [u] = await this.db.select().from(usuarios).where(eq(sql`lower(${usuarios.email})`, correo));
    return u ?? null;
  }

  // Primer ingreso sin Entra ID: los correos de BOOTSTRAP_ADMIN_EMAILS se crean como administradores.
  private async crearAdminBootstrap(correo: string): Promise<Usuario | null> {
    if (!esAdminBootstrap(correo)) return null;
    const [perfil] = await this.db.select({ id: perfiles.id }).from(perfiles).where(eq(perfiles.codigo, PERFIL_ADMIN));
    if (!perfil) return null;
    const [u] = await this.db
      .insert(usuarios)
      .values({ entraOid: `enlace:${correo}`, email: correo, nombre: correo, perfilId: perfil.id, activo: true })
      .onConflictDoNothing()
      .returning();
    return u ?? (await this.buscarPorEmail(correo));
  }

  private registrar(u: { id: string; email: string }, accion: string, req: OrigenSolicitud, after?: Record<string, unknown>) {
    return this.audit.log({
      actorId: u.id,
      actorEmail: u.email,
      accion,
      entidad: "usuarios",
      entidadId: u.id,
      cambios: after ? { after } : undefined,
      ip: req.ip ?? null,
      userAgent: req.userAgent ?? null,
    });
  }
}

const escapar = escaparHtml;

function correoHtml(nombre: string, enlace: string): string {
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:480px">
  <h2 style="color:#2c4a7f">Legal Chile</h2>
  <p>Hola ${escapar(nombre)}:</p>
  <p>Para ingresar a la plataforma, haz clic en el siguiente botón. El enlace vence en ${MINUTOS_VALIDEZ_ENLACE} minutos y sirve una sola vez.</p>
  <p><a href="${escapar(enlace)}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ingresar a Legal Chile</a></p>
  <p style="color:#64748b;font-size:13px">Si no solicitaste este acceso, ignora este correo.</p>
</div>`;
}

function correoTexto(nombre: string, enlace: string): string {
  return `Hola ${nombre}:\n\nPara ingresar a Legal Chile abre este enlace (vence en ${MINUTOS_VALIDEZ_ENLACE} minutos y sirve una sola vez):\n${enlace}\n\nSi no solicitaste este acceso, ignora este correo.`;
}
