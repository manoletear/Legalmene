import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { GestionesService } from "./gestiones.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { CreateGestion, CompletarGestion } from "@legalmene/shared";

@ApiTags("gestiones")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class GestionesController {
  constructor(private readonly service: GestionesService) {}

  @Get("atenciones/:atencionId/gestiones")
  listar(@CodPlan() codPlan: string, @Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(codPlan, atencionId);
  }

  @Post("atenciones/:atencionId/gestiones")
  @Roles("Administrador", "Supervisor", "Abogado")
  crear(
    @CodPlan() codPlan: string,
    @Param("atencionId") atencionId: string,
    @Body() body: Omit<CreateGestion, "atencionId">,
  ) {
    return this.service.crear(codPlan, { ...body, atencionId });
  }

  @Put("gestiones/:id/completar")
  @Roles("Administrador", "Supervisor", "Abogado")
  completar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @Body() body: CompletarGestion,
  ) {
    return this.service.completar(codPlan, id, body);
  }
}
