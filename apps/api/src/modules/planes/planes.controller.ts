import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PlanesService } from "./planes.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("planes")
@ApiBearerAuth("EntraID")
@UseGuards(AuthGuard("jwt-entra"), RolesGuard)
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
  @Roles("Administrador")
  crear(@Body() body: { codPlan: string; nombre: string; descripcion?: string; vigente?: boolean }) {
    return this.service.crear(body);
  }

  @Patch(":codPlan")
  @Roles("Administrador")
  actualizar(
    @Param("codPlan") codPlan: string,
    @Body() body: { nombre?: string; descripcion?: string; vigente?: boolean },
  ) {
    return this.service.actualizar(codPlan, body);
  }
}
