import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ArancelesService } from "./aranceles.service";
import { CreateArancelDto, FiltroArancelesDto, UpdateArancelDto, ValorUfDto } from "./dto";

@ApiTags("aranceles")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ArancelesController {
  constructor(@Inject(ArancelesService) private readonly service: ArancelesService) {}

  @Get("aranceles")
  listar(@Query() filtro: FiltroArancelesDto) {
    return this.service.listar(filtro);
  }

  @Post("aranceles")
  @Roles("Administrador", "Supervisor")
  @ApiQuery({ name: "codPlan", required: true })
  crear(@Query("codPlan") codPlan: string, @Body() body: CreateArancelDto) {
    if (!codPlan) throw new BadRequestException("Query param 'codPlan' es obligatorio");
    return this.service.crear(codPlan, body);
  }

  @Put("aranceles/:id")
  @Roles("Administrador", "Supervisor")
  actualizar(@Param("id") id: string, @Body() body: UpdateArancelDto) {
    return this.service.actualizar(id, body);
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
