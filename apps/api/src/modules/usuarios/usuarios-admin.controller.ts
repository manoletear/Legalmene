import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  BloqueoUsuarioSchema,
  CreatePerfilSchema,
  UpdatePerfilSchema,
  UpdateUsuarioAdminSchema,
} from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { UsuariosService } from "./usuarios.service";
import { PerfilesService } from "./perfiles.service";

class UpdateUsuarioAdminDto extends createZodDto(UpdateUsuarioAdminSchema) {}
class BloqueoUsuarioDto extends createZodDto(BloqueoUsuarioSchema) {}
class CreatePerfilDto extends createZodDto(CreatePerfilSchema) {}
class UpdatePerfilDto extends createZodDto(UpdatePerfilSchema) {}

@ApiTags("usuarios-admin")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("admin/usuarios")
export class UsuariosAdminController {
  constructor(@Inject(UsuariosService) private readonly service: UsuariosService) {}

  @Get()
  @Permiso("usuarios.administrar")
  listar(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("perfilId") perfilId?: string,
    @Query("activo") activo?: string,
  ) {
    return this.service.listar({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      q,
      perfilId,
      activo: activo === "true" ? true : activo === "false" ? false : undefined,
    });
  }

  @Patch(":id")
  @Permiso("usuarios.administrar")
  actualizar(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: UpdateUsuarioAdminDto) {
    return this.service.actualizarPorAdmin(id, body, user.id);
  }

  @Put(":id/bloqueo")
  @Permiso("usuarios.administrar")
  bloquear(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: BloqueoUsuarioDto) {
    return this.service.bloquear(id, body.bloqueado, body.motivo, user.id);
  }
}

@ApiTags("perfiles")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("admin/perfiles")
export class PerfilesController {
  constructor(@Inject(PerfilesService) private readonly service: PerfilesService) {}

  // Lectura abierta a administradores de usuarios (para asignar perfiles).
  @Get()
  @Permiso("usuarios.administrar")
  listar() {
    return this.service.listar();
  }

  @Post()
  @Permiso("perfiles.administrar")
  crear(@Body() body: CreatePerfilDto) {
    return this.service.crear(body);
  }

  @Patch(":id")
  @Permiso("perfiles.administrar")
  actualizar(@Param("id") id: string, @Body() body: UpdatePerfilDto) {
    return this.service.actualizar(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @Permiso("perfiles.administrar")
  eliminar(@Param("id") id: string) {
    return this.service.eliminar(id);
  }
}
