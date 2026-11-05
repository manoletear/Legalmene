import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { UsuariosService } from "./usuarios.service";

@ApiTags("usuarios")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard)
@Controller()
export class MeController {
  constructor(@Inject(UsuariosService) private readonly usuarios: UsuariosService) {}

  // Usuario autenticado con su perfil y permisos: el frontend arma el menú con esto.
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usuarios.actual(user);
  }

  // Usuarios activos para selects (abogado asignado, responsable, jefe).
  @Get("usuarios/opciones")
  opciones() {
    return this.usuarios.opciones();
  }
}
