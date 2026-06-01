import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UsuariosService, FiltroUsuarios } from "./usuarios.service";

@ApiTags("usuarios-admin")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("Administrador")
@Controller("admin/usuarios")
export class UsuariosAdminController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  listar(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("rol") rol?: FiltroUsuarios["rol"],
    @Query("activo") activo?: string,
  ) {
    return this.service.listar({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      q,
      rol,
      activo: activo === "true" ? true : activo === "false" ? false : undefined,
    });
  }

  @Patch(":id")
  actualizar(
    @Param("id") id: string,
    @Body() body: { rol?: FiltroUsuarios["rol"]; activo?: boolean; codPlanes?: string[] },
  ) {
    return this.service.actualizarPorAdmin(id, body);
  }
}
