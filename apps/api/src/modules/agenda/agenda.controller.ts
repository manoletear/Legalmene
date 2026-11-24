import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import type { Response } from "express";
import { ActualizarCitaSchema, CambiarEstadoCitaSchema, CrearCitaSchema, FiltroAgendaSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { MIME_XLSX } from "../exports/xlsx";
import { AgendaService } from "./agenda.service";

class FiltroAgendaDto extends createZodDto(FiltroAgendaSchema) {}
class CrearCitaDto extends createZodDto(CrearCitaSchema) {}
class ActualizarCitaDto extends createZodDto(ActualizarCitaSchema) {}
class CambiarEstadoCitaDto extends createZodDto(CambiarEstadoCitaSchema) {}

@ApiTags("agenda")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("agenda")
export class AgendaController {
  constructor(@Inject(AgendaService) private readonly service: AgendaService) {}

  @Get()
  @Permiso("agenda.ver")
  listar(@Query() f: FiltroAgendaDto) {
    return this.service.listar(f);
  }

  // Calendario en Excel (p. ej. mensual de audiencias: ?tipo=Audiencia&tipo=Comparendo).
  @Get("calendario.xlsx")
  @Permiso("agenda.ver")
  async xlsx(@Query() f: FiltroAgendaDto, @Res() res: Response) {
    const archivo = await this.service.xlsx(f);
    res.setHeader("Content-Type", MIME_XLSX);
    res.setHeader("Content-Disposition", `attachment; filename="agenda-${f.desde}_${f.hasta}.xlsx"`);
    res.send(archivo);
  }

  @Get(":id")
  @Permiso("agenda.ver")
  obtener(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Post()
  @Permiso("agenda.gestionar")
  crear(@Body() body: CrearCitaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear(body, user.id);
  }

  @Patch(":id")
  @Permiso("agenda.gestionar")
  actualizar(@Param("id", ParseUUIDPipe) id: string, @Body() body: ActualizarCitaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.actualizar(id, body, user.id);
  }

  @Post(":id/estado")
  @Permiso("agenda.gestionar")
  cambiarEstado(@Param("id", ParseUUIDPipe) id: string, @Body() body: CambiarEstadoCitaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.cambiarEstado(id, body, user.id);
  }
}
