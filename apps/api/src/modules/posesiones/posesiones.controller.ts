import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import type { Response } from "express";
import { CausanteSchema, CreatePosesionSchema, HerederoSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { PosesionesService } from "./posesiones.service";
import { PosesionPdfService } from "./posesion-pdf.service";

class CreatePosesionDto extends createZodDto(CreatePosesionSchema) {}
class CausanteDto extends createZodDto(CausanteSchema) {}
class HerederoDto extends createZodDto(HerederoSchema) {}

// Posesión efectiva: atención de tipo PosesionEfectiva + causante + herederos. La lectura
// sigue el alcance de atenciones (lo ajeno responde 404).
@ApiTags("posesiones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class PosesionesController {
  constructor(
    @Inject(PosesionesService) private readonly service: PosesionesService,
    @Inject(PosesionPdfService) private readonly pdf: PosesionPdfService,
  ) {}

  @Post("atenciones/posesiones")
  @Permiso("posesiones.crear")
  crear(@Body() body: CreatePosesionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear(body, user);
  }

  @Get("atenciones/:id/posesion")
  obtener(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Put("atenciones/:id/posesion")
  @Permiso("posesiones.crear")
  actualizar(@Param("id", ParseUUIDPipe) id: string, @Body() body: CausanteDto) {
    return this.service.actualizarCausante(id, body);
  }

  @Post("atenciones/:id/herederos")
  @Permiso("posesiones.crear")
  agregarHeredero(@Param("id", ParseUUIDPipe) id: string, @Body() body: HerederoDto) {
    return this.service.agregarHeredero(id, body);
  }

  @Delete("herederos/:id")
  @Permiso("posesiones.crear")
  quitarHeredero(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.quitarHeredero(id);
  }

  @Get("atenciones/:id/posesion.pdf")
  async ficha(@Param("id", ParseUUIDPipe) id: string, @Res() res: Response) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ficha-posesion-${id}.pdf"`);
    await this.pdf.generar(id, res);
  }
}
