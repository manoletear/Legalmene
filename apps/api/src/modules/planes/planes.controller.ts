import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { CreatePlanSchema, UpdatePlanSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PlanesService } from "./planes.service";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";

class CreatePlanDto extends createZodDto(CreatePlanSchema) {}
class UpdatePlanDto extends createZodDto(UpdatePlanSchema) {}

@ApiTags("planes")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("planes")
export class PlanesController {
  constructor(private readonly service: PlanesService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(":codPlan")
  obtener(@Param("codPlan") codPlan: string) {
    return this.service.obtener(codPlan);
  }

  @Post()
  @Permiso("planes.administrar")
  crear(@Body() body: CreatePlanDto) {
    return this.service.crear(body);
  }

  @Patch(":codPlan")
  @Permiso("planes.administrar")
  actualizar(@Param("codPlan") codPlan: string, @Body() body: UpdatePlanDto) {
    return this.service.actualizar(codPlan, body);
  }
}
