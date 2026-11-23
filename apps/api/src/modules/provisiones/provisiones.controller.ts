import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { ProvisionesService } from "./provisiones.service";
import {
  DevolucionDto,
  EntregaDto,
  FiltroProvisionesDto,
  ObservacionDto,
  PagoClienteDto,
  RechazoDto,
  RegistrarMovimientoDto,
  SolicitarProvisionDto,
} from "./dto";

function usuarioId(user: AuthenticatedUser): string {
  if (!user?.id) throw new UnauthorizedException("Usuario sin id resuelto");
  return user.id;
}

// Ciclo de provisión de fondos (Anexo §X). Cada etapa la ejecuta un perfil distinto.
@ApiTags("provisiones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class ProvisionesController {
  constructor(@Inject(ProvisionesService) private readonly service: ProvisionesService) {}

  @Get("provisiones")
  listar(@Query() filtro: FiltroProvisionesDto) {
    return this.service.listar(filtro);
  }

  @Get("atenciones/:atencionId/provisiones")
  listarPorAtencion(@Param("atencionId", ParseUUIDPipe) atencionId: string) {
    return this.service.listarPorAtencion(atencionId);
  }

  @Post("atenciones/:atencionId/provisiones")
  @Permiso("provisiones.solicitar")
  solicitar(
    @CurrentUser() user: AuthenticatedUser,
    @Param("atencionId", ParseUUIDPipe) atencionId: string,
    @Body() body: SolicitarProvisionDto,
  ) {
    return this.service.solicitar(atencionId, usuarioId(user), body);
  }

  @Post("provisiones/:id/pago-cliente")
  @Permiso("provisiones.registrar_pago")
  pagoCliente(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: PagoClienteDto) {
    return this.service.registrarPagoCliente(id, usuarioId(user), body.medio, body.fecha);
  }

  @Post("provisiones/:id/solicitar-entrega")
  @Permiso("provisiones.solicitar")
  solicitarEntrega(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.solicitarEntrega(id, usuarioId(user));
  }

  @Post("provisiones/:id/autorizar")
  @Permiso("provisiones.autorizar")
  autorizar(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: ObservacionDto) {
    return this.service.autorizar(id, usuarioId(user), body.observacion);
  }

  @Post("provisiones/:id/rechazar-entrega")
  @Permiso("provisiones.autorizar")
  rechazarEntrega(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: RechazoDto) {
    return this.service.rechazarEntrega(id, usuarioId(user), body.observacion);
  }

  @Post("provisiones/:id/disponible")
  @Permiso("provisiones.disponer_entregar")
  disponible(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.marcarDisponible(id, usuarioId(user));
  }

  @Post("provisiones/:id/entregar")
  @Permiso("provisiones.disponer_entregar")
  entregar(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: EntregaDto) {
    return this.service.entregar(id, usuarioId(user), body.montoEntregado);
  }

  @Post("provisiones/:id/rendir")
  @Permiso("provisiones.rendir")
  rendir(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.rendir(id, usuarioId(user));
  }

  @Post("provisiones/:id/devolucion")
  @Permiso("provisiones.disponer_entregar")
  devolucion(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: DevolucionDto) {
    return this.service.registrarDevolucion(id, usuarioId(user), body.numeroCheque, body.observacion);
  }

  @Get("provisiones/:id/eventos")
  eventos(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.eventos(id);
  }

  @Get("provisiones/:id/movimientos")
  movimientos(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.listarMovimientos(id);
  }

  @Post("provisiones/:id/movimientos")
  @Permiso("provisiones.registrar_movimientos")
  registrarMovimiento(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RegistrarMovimientoDto,
  ) {
    return this.service.registrarMovimiento(id, usuarioId(user), body);
  }
}
