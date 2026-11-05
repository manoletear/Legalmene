import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AfiliadosService } from "./afiliados.service";
import {
  AsignarPlanDto,
  CreateAfiliadoDto,
  FiltroAfiliadosDto,
  TerminarPlanDto,
  UpdateAfiliadoDto,
} from "./dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("afiliados")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("afiliados")
export class AfiliadosController {
  constructor(@Inject(AfiliadosService) private readonly service: AfiliadosService) {}

  @Get()
  buscar(@Query() filtro: FiltroAfiliadosDto) {
    return this.service.buscar(filtro);
  }

  // Consulta por RUT del Anexo: persona + todos sus planes, vigentes primero.
  @Get("rut/:rut")
  consultarPorRut(@Param("rut") rut: string) {
    return this.service.consultarPorRut(rut);
  }

  @Get(":id")
  obtener(@Param("id") id: string) {
    return this.service.obtenerConPlanes(id);
  }

  @Post()
  @Roles("Administrador", "Supervisor", "Operador")
  crear(@Body() body: CreateAfiliadoDto) {
    return this.service.crear(body);
  }

  @Patch(":id")
  @Roles("Administrador", "Supervisor")
  actualizar(@Param("id") id: string, @Body() body: UpdateAfiliadoDto) {
    return this.service.actualizar(id, body);
  }

  @Delete(":id")
  @Roles("Administrador")
  eliminar(@Param("id") id: string) {
    return this.service.eliminar(id);
  }

  @Post(":id/planes")
  @Roles("Administrador")
  asignarPlan(@Param("id") id: string, @Body() body: AsignarPlanDto) {
    return this.service.asignarPlan(id, body);
  }

  @Put(":id/planes/:codPlan/termino")
  @Roles("Administrador")
  terminarPlan(
    @Param("id") id: string,
    @Param("codPlan") codPlan: string,
    @Body() body: TerminarPlanDto,
  ) {
    return this.service.terminarPlan(id, codPlan, body.fechaTermino);
  }
}
