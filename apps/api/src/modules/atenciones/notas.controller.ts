import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { CrearNotaSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { NotasService } from "./notas.service";

class CrearNotaDto extends createZodDto(CrearNotaSchema) {}

@ApiTags("atenciones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class NotasController {
  constructor(@Inject(NotasService) private readonly service: NotasService) {}

  @Get("atenciones/:id/notas")
  listar(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.listar(id);
  }

  @Post("atenciones/:id/notas")
  @Permiso("gestiones.registrar")
  crear(@Param("id", ParseUUIDPipe) id: string, @Body() body: CrearNotaDto, @CurrentUser() user: AuthenticatedUser) {
    if (!user?.id) throw new UnauthorizedException("Usuario sin id resuelto");
    return this.service.crear(id, user.id, body);
  }
}
