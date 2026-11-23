import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { CreateFeriadoSchema, UpdateFeriadoSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { FeriadosService } from "./feriados.service";

class CreateFeriadoDto extends createZodDto(CreateFeriadoSchema) {}
class UpdateFeriadoDto extends createZodDto(UpdateFeriadoSchema) {}
const FiltroFeriadosSchema = z.object({ anio: z.coerce.number().int().min(2000).max(2100).optional() });
class FiltroFeriadosDto extends createZodDto(FiltroFeriadosSchema) {}

@ApiTags("maestros")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("feriados")
export class FeriadosController {
  constructor(@Inject(FeriadosService) private readonly service: FeriadosService) {}

  @Get()
  listar(@Query() f: FiltroFeriadosDto) {
    return this.service.listar(f.anio);
  }

  @Post()
  @Permiso("maestros.administrar")
  crear(@Body() body: CreateFeriadoDto) {
    return this.service.crear(body);
  }

  @Put(":id")
  @Permiso("maestros.administrar")
  actualizar(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateFeriadoDto) {
    return this.service.actualizar(id, body);
  }
}
