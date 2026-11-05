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
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";

@ApiTags("afiliados")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("afiliados")
export class AfiliadosController {
  constructor(@Inject(AfiliadosService) private readonly service: AfiliadosService) {}

  @Get()
  @Permiso("afiliados.ver")
  buscar(@Query() filtro: FiltroAfiliadosDto) {
    return this.service.buscar(filtro);
  }

  // Consulta por RUT del Anexo: persona + todos sus planes, vigentes primero.
  @Get("rut/:rut")
  @Permiso("afiliados.ver")
  consultarPorRut(@Param("rut") rut: string) {
    return this.service.consultarPorRut(rut);
  }

  @Get(":id")
  @Permiso("afiliados.ver")
  obtener(@Param("id") id: string) {
    return this.service.obtenerConPlanes(id);
  }

  @Post()
  @Permiso("afiliados.crear")
  crear(@Body() body: CreateAfiliadoDto) {
    return this.service.crear(body);
  }

  @Patch(":id")
  @Permiso("afiliados.editar")
  actualizar(@Param("id") id: string, @Body() body: UpdateAfiliadoDto) {
    return this.service.actualizar(id, body);
  }

  @Delete(":id")
  @Permiso("afiliados.eliminar")
  eliminar(@Param("id") id: string) {
    return this.service.eliminar(id);
  }

  @Post(":id/planes")
  @Permiso("afiliados.asignar_planes")
  asignarPlan(@Param("id") id: string, @Body() body: AsignarPlanDto) {
    return this.service.asignarPlan(id, body);
  }

  @Put(":id/planes/:codPlan/termino")
  @Permiso("afiliados.asignar_planes")
  terminarPlan(
    @Param("id") id: string,
    @Param("codPlan") codPlan: string,
    @Body() body: TerminarPlanDto,
  ) {
    return this.service.terminarPlan(id, codPlan, body.fechaTermino);
  }
}
