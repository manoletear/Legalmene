import { ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { UsuariosService, UsuarioNoHabilitadoError, type ClaimsDev } from "../usuarios/usuarios.service";
import { AuditService } from "../audit/audit.service";
import { fijarAcceso } from "../../common/acceso/contexto";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { dominioPermitido } from "./dominio";
import { tokenBearer, verificarSesion } from "./sesion";
import { createHash } from "crypto";

// Tokens de Entra ID ya registrados como ingreso (hash → vencimiento), para auditar una vez por token.
const ingresosEntra = new Map<string, number>();

export { dominioPermitido };

export function entraConfigurado(env = process.env): boolean {
  return !!env.ENTRA_AUDIENCE?.trim() && !!env.ENTRA_ISSUER?.trim();
}

type RequestConUsuario = Request & { user?: AuthenticatedUser | { id: string } };

// Valida la sesión propia (enlace de acceso) o el JWT de Entra ID y resuelve el usuario con su perfil y permisos. En modo DEV
// (AUTH_DISABLED=true) acepta X-Dev-User=<base64-json> con {entraOid,email,nombre,perfil}.
// El bloqueo por intentos fallidos de login lo aplica Entra ID (Smart Lockout); aquí se
// rechazan usuarios desactivados o bloqueados por el administrador.
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt-entra") {
  constructor(
    @Inject(UsuariosService) private readonly usuariosService: UsuariosService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestConUsuario>();
    let usuarioId: string;
    // Sesión propia (login con enlace de acceso): se acepta también en modo demo.
    const bearer = tokenBearer(req.header("authorization"));
    const sesion = bearer ? verificarSesion(bearer) : null;
    if (sesion) {
      usuarioId = sesion.usuarioId;
    } else if (process.env.AUTH_DISABLED === "true") {
      usuarioId = (await this.usuariosService.resolveDev(this.claimsDev(req))).id;
    } else {
      // Entra ID solo con audience e issuer fijados: sin ellos passport-jwt no los valida y
      // aceptaría tokens de cualquier tenant y aplicación (falla cerrado).
      if (!entraConfigurado()) throw new UnauthorizedException("Sesión no válida. Ingrese nuevamente.");
      await (super.canActivate(context) as Promise<boolean>);
      usuarioId = (req.user as { id: string }).id;
      await this.registrarIngresoEntra(req, bearer!, usuarioId);
    }

    let user: AuthenticatedUser;
    try {
      user = await this.usuariosService.contextoAcceso(usuarioId);
    } catch (err) {
      if (err instanceof UsuarioNoHabilitadoError) {
        await this.denegar(req, err.usuario, err.message);
        throw new ForbiddenException(err.message);
      }
      throw err;
    }
    // Una sesión emitida antes del último "cerrar sesión" ya no vale.
    if (sesion && sesion.version !== user.sesionVersion) {
      throw new UnauthorizedException("La sesión fue cerrada. Ingrese nuevamente.");
    }
    if (process.env.AUTH_DISABLED !== "true" && !dominioPermitido(user.email)) {
      const msg = "Su cuenta no pertenece a un dominio autorizado de LegalChile";
      await this.denegar(req, user, msg);
      throw new ForbiddenException(msg);
    }
    req.user = user;
    fijarAcceso({ usuarioId: user.id, permisos: new Set(user.permisos) });
    return true;
  }

  // Anexo §I l.63: el ingreso con Microsoft queda en la auditoría la primera vez que se usa cada token.
  private async registrarIngresoEntra(req: Request, token: string, usuarioId: string): Promise<void> {
    const clave = createHash("sha256").update(token).digest("hex");
    const ahora = Date.now();
    if ((ingresosEntra.get(clave) ?? 0) > ahora) return;
    if (ingresosEntra.size > 5000) for (const [k, v] of ingresosEntra) if (v <= ahora) ingresosEntra.delete(k);
    const exp = Number((req.user as { exp?: number }).exp ?? 0) * 1000;
    ingresosEntra.set(clave, exp > ahora ? exp : ahora + 3600_000);
    const u = req.user as { id: string; email?: string };
    await this.audit.log({
      actorId: usuarioId,
      actorEmail: u.email ?? null,
      accion: "INGRESO",
      entidad: "usuarios",
      entidadId: usuarioId,
      cambios: { after: { metodo: "EntraID" } },
      ip: req.ip ?? null,
      userAgent: req.get?.("user-agent") ?? null,
    });
  }

  private async denegar(req: Request, u: { id: string; email: string }, motivo: string): Promise<void> {
    await this.audit.log({
      actorId: u.id,
      actorEmail: u.email,
      accion: "ACCESO_DENEGADO",
      entidad: "usuarios",
      entidadId: u.id,
      cambios: { after: { motivo, ruta: req.originalUrl ?? req.url } },
      ip: req.ip ?? null,
      userAgent: req.get?.("user-agent") ?? null,
    });
  }

  private claimsDev(req: Request): ClaimsDev {
    const header = req.header("x-dev-user");
    if (header) {
      try {
        return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as ClaimsDev;
      } catch {
        // Header mal formado: se usa el administrador de desarrollo.
      }
    }
    // Alineado con seed.ts para evitar colisión con la unique de email.
    return {
      entraOid: "00000000-0000-0000-0000-000000000001",
      email: "admin@legalchile.cl",
      nombre: "Admin Demo",
      perfil: "ADMIN",
    };
  }
}
