import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { Observable, from } from "rxjs";
import { UsuariosService } from "../usuarios/usuarios.service";

// Guard que normalmente valida JWT Entra ID, pero en modo DEV permite
// pasar un header X-Dev-User=<base64-json> para evitar tener un tenant Entra
// configurado durante desarrollo local.
//
// Producción: AUTH_DISABLED debe estar ausente o "false".
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt-entra") {
  constructor(private readonly usuariosService: UsuariosService) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    if (process.env.AUTH_DISABLED !== "true") {
      return super.canActivate(context) as boolean | Promise<boolean> | Observable<boolean>;
    }

    const req = context.switchToHttp().getRequest<
      Request & {
        user?: {
          id?: string;
          entraOid: string;
          email: string;
          nombre: string;
          rol: string;
          codPlanes: string[];
        };
      }
    >();

    let claims: {
      entraOid: string;
      email: string;
      nombre: string;
      rol: "Administrador" | "Supervisor" | "Abogado" | "Operador" | "Auditor";
      codPlanes: string[];
    };

    const header = req.header("x-dev-user");
    if (header) {
      try {
        claims = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
      } catch {
        claims = this.defaultClaims();
      }
    } else {
      claims = this.defaultClaims();
    }

    // Resuelve usuarios.id desde DB para que actorId del audit interceptor
    // y los FKs (convocadoPor, responsableId) apunten a un id real.
    return from(
      (async () => {
        const usuario = await this.usuariosService.resolveByEntraOid(claims);
        req.user = {
          id: usuario.id,
          entraOid: usuario.entraOid,
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.rol,
          codPlanes: usuario.codPlanes,
        };
        return true;
      })(),
    );
  }

  // Alineado con seed.ts para evitar colisión con la unique de email.
  private defaultClaims(): {
    entraOid: string;
    email: string;
    nombre: string;
    rol: "Administrador";
    codPlanes: string[];
  } {
    return {
      entraOid: "00000000-0000-0000-0000-000000000001",
      email: "admin@legalchile.cl",
      nombre: "Admin Demo",
      rol: "Administrador",
      codPlanes: ["DEMO", "EMP01"],
    };
  }
}
