import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags, ApiHeader } from "@nestjs/swagger";
import { AfiliadosService } from "./afiliados.service";
import { CreateAfiliadoDto, UpdateAfiliadoDto, FiltroAfiliadosDto } from "./dto";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("afiliados")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true, description: "Plan/Tenant del cliente" })
@UseGuards(AuthGuard("jwt-entra"), RolesGuard)
@Controller("afiliados")
export class AfiliadosController {
  constructor(private readonly service: AfiliadosService) {}

  @Get()
  buscar(@CodPlan() codPlan: string, @Query() filtro: FiltroAfiliadosDto) {
    return this.service.buscar(codPlan, filtro);
  }

  @Get(":id")
  obtener(@CodPlan() codPlan: string, @Param("id") id: string) {
    return this.service.obtener(codPlan, id);
  }

  @Post()
  @Roles("Administrador", "Supervisor", "Operador")
  crear(@CodPlan() codPlan: string, @Body() body: CreateAfiliadoDto) {
    return this.service.crear(codPlan, body);
  }

  @Patch(":id")
  @Roles("Administrador", "Supervisor")
  actualizar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @Body() body: UpdateAfiliadoDto,
  ) {
    return this.service.actualizar(codPlan, id, body);
  }

  @Delete(":id")
  @Roles("Administrador")
  eliminar(@CodPlan() codPlan: string, @Param("id") id: string) {
    return this.service.eliminar(codPlan, id);
  }
}
