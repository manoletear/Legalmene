import {
  Body,
  Controller,
  Delete,
  Inject,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AtencionesService } from "./atenciones.service";
import {
  CambiarEstadoDto,
  CreateAtencionDto,
  CreateContraparteDto,
  FiltroAtencionesDto,
  NuevoCorrelativoDto,
  UpdateAtencionDto,
  UpdateContraparteDto,
} from "./dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";

@ApiTags("atenciones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AtencionesController {
  constructor(@Inject(AtencionesService) private readonly service: AtencionesService) {}

  @Get("atenciones")
  buscar(@Query() filtro: FiltroAtencionesDto) {
    return this.service.buscar(filtro);
  }

  @Get("atenciones/:id")
  obtener(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Post("atenciones/consultas")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  crearConsulta(@Body() body: CreateAtencionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear({ ...body, tipo: "Consulta" }, user);
  }

  @Post("atenciones/asesorias")
  @Roles("Administrador", "Supervisor", "Abogado")
  crearAsesoria(@Body() body: CreateAtencionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear({ ...body, tipo: "Asesoria" }, user);
  }

  @Post("atenciones/juicios")
  @Roles("Administrador", "Supervisor", "Abogado")
  crearJuicio(@Body() body: CreateAtencionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear({ ...body, tipo: "Juicio" }, user);
  }

  @Patch("atenciones/:id")
  @Roles("Administrador", "Supervisor", "Abogado")
  actualizar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateAtencionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.actualizar(id, body, user);
  }

  @Post("atenciones/:id/estado")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  cambiarEstado(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CambiarEstadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cambiarEstado(id, body, user);
  }

  @Post("atenciones/:id/nuevo-correlativo")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  nuevoCorrelativo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: NuevoCorrelativoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.nuevoCorrelativo(id, body, user);
  }

  @Get("atenciones/:id/contrapartes")
  listarContrapartes(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.listarContrapartes(id);
  }

  @Post("atenciones/:id/contrapartes")
  @Roles("Administrador", "Supervisor", "Abogado")
  crearContraparte(@Param("id", ParseUUIDPipe) id: string, @Body() body: CreateContraparteDto) {
    return this.service.crearContraparte(id, body);
  }

  @Put("contrapartes/:id")
  @Roles("Administrador", "Supervisor", "Abogado")
  actualizarContraparte(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateContraparteDto) {
    return this.service.actualizarContraparte(id, body);
  }

  @Delete("contrapartes/:id")
  @Roles("Administrador", "Supervisor", "Abogado")
  eliminarContraparte(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.eliminarContraparte(id);
  }
}
