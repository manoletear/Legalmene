import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";

// Guard que normalmente valida JWT Entra ID, pero en modo DEV permite
// pasar un header X-Dev-User=<base64-json> para evitar tener un tenant Entra
// configurado durante desarrollo local.
//
// Producción: AUTH_DISABLED debe estar ausente o "false".
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt-entra") {
  canActivate(context: ExecutionContext) {
    if (process.env.AUTH_DISABLED === "true") {
      const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
      const header = req.header("x-dev-user");
      let user: Record<string, unknown> = {
        entraOid: "dev-oid",
        email: "dev@legalchile.cl",
        nombre: "Dev User",
        rol: "Administrador",
        codPlanes: ["DEMO", "EMP01"],
      };
      if (header) {
        try {
          user = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
        } catch {
          /* ignore, use default */
        }
      }
      req.user = user;
      return true;
    }
    return super.canActivate(context);
  }
}
