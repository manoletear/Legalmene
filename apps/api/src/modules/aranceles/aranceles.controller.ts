import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ArancelesService } from "./aranceles.service";
import { CreateArancelDto, FiltroArancelesDto, UpdateArancelDto, ValorUfDto } from "./dto";

@ApiTags("aranceles")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ArancelesController {
  constructor(@Inject(ArancelesService) private readonly service: ArancelesService) {}

  @Get("aranceles")
  listar(@CodPlan() codPlan: string, @Query() filtro: FiltroArancelesDto) {
    return this.service.listar(codPlan, filtro);
  }

  @Post("aranceles")
  @Roles("Administrador", "Supervisor")
  crear(@CodPlan() codPlan: string, @Body() body: CreateArancelDto) {
    return this.service.crear(codPlan, body);
  }

  @Put("aranceles/:id")
  @Roles("Administrador", "Supervisor")
  actualizar(@CodPlan() codPlan: string, @Param("id") id: string, @Body() body: UpdateArancelDto) {
    return this.service.actualizar(codPlan, id, body);
  }

  @Get("valores-uf/vigente")
  ufVigente() {
    return this.service.ufVigente();
  }

  // La UF es nacional (no por plan): solo Administrador la actualiza.
  @Put("valores-uf")
  @Roles("Administrador")
  registrarUf(@Body() body: ValorUfDto) {
    return this.service.registrarUf(body);
  }
}
