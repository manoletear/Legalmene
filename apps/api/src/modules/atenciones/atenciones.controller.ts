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
import { createZodDto } from "nestjs-zod";
import {
  RechazarCoberturaSchema,
  RechazarTerminoSchema,
  RegistrarContactoSchema,
  ResolverCoberturaSchema,
  SolicitarTerminoSchema,
} from "@legalmene/shared";
import { AtencionesService } from "./atenciones.service";
import { PlazosService } from "./plazos.service";
import {
  CambiarEstadoDto,
  CreateAtencionDto,
  CreateContraparteDto,
  FiltroAtencionesDto,
  NuevoCorrelativoDto,
  UpdateAtencionDto,
  UpdateContraparteDto,
} from "./dto";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";

class RegistrarContactoDto extends createZodDto(RegistrarContactoSchema) {}
class SolicitarTerminoDto extends createZodDto(SolicitarTerminoSchema) {}
class RechazarTerminoDto extends createZodDto(RechazarTerminoSchema) {}
class ResolverCoberturaDto extends createZodDto(ResolverCoberturaSchema) {}
class RechazarCoberturaDto extends createZodDto(RechazarCoberturaSchema) {}

@ApiTags("atenciones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class AtencionesController {
  constructor(
    @Inject(AtencionesService) private readonly service: AtencionesService,
    @Inject(PlazosService) private readonly plazos: PlazosService,
  ) {}

  // Plazos del Anexo en días hábiles (contacto, primera presentación, rendición de fondos).
  @Get("atenciones/:id/plazos")
  plazosDeAtencion(@Param("id", ParseUUIDPipe) id: string) {
    return this.plazos.deAtencion(id);
  }

  @Post("atenciones/:id/primer-contacto")
  @Permiso("gestiones.registrar")
  registrarContacto(@Param("id", ParseUUIDPipe) id: string, @Body() body: RegistrarContactoDto) {
    return this.plazos.registrarContacto(id, body.fecha);
  }

  @Get("atenciones")
  buscar(@Query() filtro: FiltroAtencionesDto) {
    return this.service.buscar(filtro);
  }

  @Get("atenciones/:id")
  obtener(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Post("atenciones/consultas")
  @Permiso("atenciones.crear_consulta")
  crearConsulta(@Body() body: CreateAtencionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear({ ...body, tipo: "Consulta" }, user);
  }

  @Post("atenciones/asesorias")
  @Permiso("atenciones.crear_caso")
  crearAsesoria(@Body() body: CreateAtencionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear({ ...body, tipo: "Asesoria" }, user);
  }

  @Post("atenciones/juicios")
  @Permiso("atenciones.crear_caso")
  crearJuicio(@Body() body: CreateAtencionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.crear({ ...body, tipo: "Juicio" }, user);
  }

  @Patch("atenciones/:id")
  @Permiso("atenciones.editar")
  actualizar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateAtencionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.actualizar(id, body, user);
  }

  // Sin cobertura del plan: Gerencia de Servicios autoriza o no la atención (Anexo §VII 01.2).
  @Post("atenciones/:id/cobertura/autorizar")
  @Permiso("atenciones.autorizar_sin_cobertura")
  autorizarCobertura(@Param("id", ParseUUIDPipe) id: string, @Body() body: ResolverCoberturaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.resolverCobertura(id, true, body.observacion, user);
  }

  @Post("atenciones/:id/cobertura/rechazar")
  @Permiso("atenciones.autorizar_sin_cobertura")
  rechazarCobertura(@Param("id", ParseUUIDPipe) id: string, @Body() body: RechazarCoberturaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.resolverCobertura(id, false, body.observacion, user);
  }

  // V°B° de jefatura para terminar asesorías y juicios (Anexo §VII l.904, §VIII l.1192).
  @Post("atenciones/:id/termino/solicitar")
  @Permiso("atenciones.cambiar_estado")
  solicitarTermino(@Param("id", ParseUUIDPipe) id: string, @Body() body: SolicitarTerminoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.solicitarTermino(id, body, user);
  }

  @Post("atenciones/:id/termino/aprobar")
  @Permiso("atenciones.aprobar_termino")
  aprobarTermino(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.aprobarTermino(id, user);
  }

  // V°B° de la jefatura judicial a la primera presentación del juicio.
  @Post(":id/vb-primera-presentacion")
  @Permiso("atenciones.aprobar_termino")
  vbPrimeraPresentacion(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.vbPrimeraPresentacion(id, user);
  }

  @Post("atenciones/:id/termino/rechazar")
  @Permiso("atenciones.aprobar_termino")
  rechazarTermino(@Param("id", ParseUUIDPipe) id: string, @Body() body: RechazarTerminoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.rechazarTermino(id, body.motivo, user);
  }

  @Post("atenciones/:id/estado")
  @Permiso("atenciones.cambiar_estado")
  cambiarEstado(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CambiarEstadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cambiarEstado(id, body, user);
  }

  @Post("atenciones/:id/nuevo-correlativo")
  @Permiso("atenciones.crear_consulta")
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
  @Permiso("atenciones.editar")
  crearContraparte(@Param("id", ParseUUIDPipe) id: string, @Body() body: CreateContraparteDto) {
    return this.service.crearContraparte(id, body);
  }

  @Put("contrapartes/:id")
  @Permiso("atenciones.editar")
  actualizarContraparte(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateContraparteDto) {
    return this.service.actualizarContraparte(id, body);
  }

  @Delete("contrapartes/:id")
  @Permiso("atenciones.editar")
  eliminarContraparte(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.eliminarContraparte(id);
  }
}
