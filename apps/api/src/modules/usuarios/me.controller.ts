import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { UsuariosService } from "./usuarios.service";

@ApiTags("usuarios")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard)
@Controller()
export class MeController {
  constructor(private readonly usuarios: UsuariosService) {}

  // Devuelve el usuario autenticado (resuelto desde el JWT/dev guard).
  // Usado por el frontend para renderizar nombre, rol, planes accesibles.
  @Get("me")
  async me(@CurrentUser() user: AuthenticatedUser) {
    if (!user.id) return user;
    const full = await this.usuarios.obtenerPorId(user.id);
    return full ?? user;
  }
}
