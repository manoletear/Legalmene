import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { CreateGestionPlantillaSchema, UpdateGestionPlantillaSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PlantillasService } from "./plantillas.service";

class CreatePlantillaDto extends createZodDto(CreateGestionPlantillaSchema) {}
class UpdatePlantillaDto extends createZodDto(UpdateGestionPlantillaSchema) {}
class FiltroPlantillasDto extends createZodDto(
  z.object({
    materiaId: z.string().uuid().optional(),
    procedimientoId: z.string().uuid().optional(),
    vigente: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
  }),
) {}

@ApiTags("gestiones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("gestiones-plantilla")
export class PlantillasController {
  constructor(@Inject(PlantillasService) private readonly service: PlantillasService) {}

  @Get()
  listar(@Query() filtro: FiltroPlantillasDto) {
    return this.service.listar(filtro);
  }

  @Post()
  @Roles("Administrador")
  crear(@Body() body: CreatePlantillaDto) {
    return this.service.crear(body);
  }

  @Put(":id")
  @Roles("Administrador")
  actualizar(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdatePlantillaDto) {
    return this.service.actualizar(id, body);
  }
}
