import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { MotivoCorreccionSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { CorreccionesService } from "./correcciones.service";

class MotivoDto extends createZodDto(MotivoCorreccionSchema) {}

// Herramientas del administrador (Anexo §II l.156). Todas exigen flujos.corregir.
@ApiTags("correcciones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("correcciones")
export class CorreccionesController {
  constructor(@Inject(CorreccionesService) private readonly service: CorreccionesService) {}

  @Get("atenciones/:correlativo")
  @Permiso("flujos.corregir")
  panorama(@Param("correlativo") correlativo: string) {
    return this.service.panorama(correlativo);
  }

  @Post("atenciones/:id/reabrir")
  @Permiso("flujos.corregir")
  reabrir(@Param("id", ParseUUIDPipe) id: string, @Body() body: MotivoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reabrirAtencion(id, body.motivo, user.id);
  }

  @Post("derivaciones/:id/reiniciar")
  @Permiso("flujos.corregir")
  reiniciarDerivacion(@Param("id", ParseUUIDPipe) id: string, @Body() body: MotivoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reiniciarDerivacion(id, body.motivo, user.id);
  }

  @Post("atenciones/:id/arancel/retroceder")
  @Permiso("flujos.corregir")
  retrocederArancel(@Param("id", ParseUUIDPipe) id: string, @Body() body: MotivoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.retrocederArancel(id, body.motivo, user.id);
  }

  @Post("provisiones/:id/retroceder")
  @Permiso("flujos.corregir")
  retrocederProvision(@Param("id", ParseUUIDPipe) id: string, @Body() body: MotivoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.retrocederProvision(id, body.motivo, user.id);
  }
}
