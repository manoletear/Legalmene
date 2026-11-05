import { ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { UsuariosService, UsuarioNoHabilitadoError, type ClaimsDev } from "../usuarios/usuarios.service";
import { AuditService } from "../audit/audit.service";
import { fijarAcceso } from "../../common/acceso/contexto";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";

// Anexo §IV: solo usuarios del dominio LegalChile ingresan.
export function dominioPermitido(email: string, config = process.env.ALLOWED_EMAIL_DOMAIN): boolean {
  const dominios = (config ?? "legalchile.cl")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const dominio = email.split("@")[1]?.toLowerCase() ?? "";
  return dominios.includes(dominio);
}

type RequestConUsuario = Request & { user?: AuthenticatedUser | { id: string } };

// Valida el JWT de Entra ID y resuelve el usuario con su perfil y permisos. En modo DEV
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
    if (process.env.AUTH_DISABLED === "true") {
      usuarioId = (await this.usuariosService.resolveDev(this.claimsDev(req))).id;
    } else {
      await (super.canActivate(context) as Promise<boolean>);
      usuarioId = (req.user as { id: string }).id;
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
    if (process.env.AUTH_DISABLED !== "true" && !dominioPermitido(user.email)) {
      const msg = "Su cuenta no pertenece a un dominio autorizado de LegalChile";
      await this.denegar(req, user, msg);
      throw new ForbiddenException(msg);
    }
    req.user = user;
    fijarAcceso({ usuarioId: user.id, permisos: new Set(user.permisos) });
    return true;
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
