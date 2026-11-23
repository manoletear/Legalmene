import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, ExtractJwt } from "passport-jwt";
import { passportJwtSecret } from "jwks-rsa";
import { UsuariosService } from "../usuarios/usuarios.service";

interface EntraClaims {
  oid?: string;
  sub?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

@Injectable()
export class EntraStrategy extends PassportStrategy(Strategy, "jwt-entra") {
  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(UsuariosService) private readonly usuariosService: UsuariosService,
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

  // Upsert al login: garantiza que usuarios.id exista. El perfil y permisos los resuelve
  // JwtAuthGuard desde la base (los administra la aplicación, no el token).
  async validate(payload: EntraClaims): Promise<{ id: string }> {
    const oid = payload.oid ?? payload.sub;
    if (!oid) throw new UnauthorizedException("Token sin oid/sub");
    const email = payload.email ?? payload.preferred_username;
    if (!email) throw new UnauthorizedException("Token sin email");
    const usuario = await this.usuariosService.resolveByEntraOid({
      entraOid: oid,
      email,
      nombre: payload.name ?? email,
    });
    return { id: usuario.id };
  }
}
