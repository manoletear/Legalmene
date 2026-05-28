import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, ExtractJwt } from "passport-jwt";
import { passportJwtSecret } from "jwks-rsa";
import { UsuariosService } from "../usuarios/usuarios.service";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";

interface EntraClaims {
  oid?: string;
  sub?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  roles?: string[];
  // Custom claim configurado en Entra ID para mapear planes accesibles del usuario.
  extension_CodPlanes?: string;
}

@Injectable()
export class EntraStrategy extends PassportStrategy(Strategy, "jwt-entra") {
  constructor(
    config: ConfigService,
    private readonly usuariosService: UsuariosService,
  ) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri:
          config.get<string>("ENTRA_JWKS_URI") ??
          "https://login.microsoftonline.com/common/discovery/v2.0/keys",
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: config.get<string>("ENTRA_AUDIENCE"),
      issuer: config.get<string>("ENTRA_ISSUER"),
      algorithms: ["RS256"],
    });
  }

  async validate(payload: EntraClaims): Promise<AuthenticatedUser> {
    const oid = payload.oid ?? payload.sub;
    if (!oid) throw new UnauthorizedException("Token sin oid/sub");
    const email = payload.email ?? payload.preferred_username;
    if (!email) throw new UnauthorizedException("Token sin email");

    const rol = (payload.roles?.[0] ?? "Operador") as
      | "Administrador"
      | "Supervisor"
      | "Abogado"
      | "Operador"
      | "Auditor";
    const codPlanes = (payload.extension_CodPlanes ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const nombre = payload.name ?? email;

    // Upsert al login: garantiza que usuarios.id exista localmente y que
    // los datos del IdP (rol, email, nombre, planes) estén sincronizados.
    const usuario = await this.usuariosService.resolveByEntraOid({
      entraOid: oid,
      email,
      nombre,
      rol,
      codPlanes,
    });

    return {
      id: usuario.id,
      entraOid: usuario.entraOid,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      codPlanes: usuario.codPlanes,
    };
  }
}
