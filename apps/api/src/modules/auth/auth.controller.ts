import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { createZodDto } from "nestjs-zod";
import type { Request } from "express";
import { SolicitarEnlaceSchema, VerificarEnlaceSchema } from "@legalmene/shared";
import { EnlacesAccesoService, type OrigenSolicitud } from "./enlaces-acceso.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { UsuariosService } from "../usuarios/usuarios.service";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator";

class SolicitarEnlaceDto extends createZodDto(SolicitarEnlaceSchema) {}
class VerificarEnlaceDto extends createZodDto(VerificarEnlaceSchema) {}

const origen = (req: Request): OrigenSolicitud => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent") ?? null,
  origen: req.get("origin") ?? null,
});

// Endpoints públicos del login con enlace de acceso. Límite por IP holgado (la oficina sale
// por una sola IP); el envío de correos además se limita por usuario en el servicio.
@ApiTags("auth")
@Throttle({ short: { limit: 20, ttl: 60_000 }, medium: { limit: 300, ttl: 3_600_000 } })
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(EnlacesAccesoService) private readonly enlaces: EnlacesAccesoService,
    @Inject(UsuariosService) private readonly usuarios: UsuariosService,
  ) {}

  // Cerrar sesión: invalida en el servidor todas las sesiones del usuario.
  @Post("logout")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.usuarios.revocarSesiones(user.id);
  }

  @Post("enlace")
  @HttpCode(202)
  solicitar(@Body() dto: SolicitarEnlaceDto, @Req() req: Request) {
    return this.enlaces.solicitar(dto.email, origen(req));
  }

  @Post("enlace/verificar")
  @HttpCode(200)
  verificar(@Body() dto: VerificarEnlaceDto, @Req() req: Request) {
    return this.enlaces.verificar(dto.token, origen(req));
  }
}
