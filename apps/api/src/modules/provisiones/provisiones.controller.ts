import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ProvisionesService } from "./provisiones.service";
import {
  FiltroProvisionesDto,
  RegistrarMovimientoDto,
  ResolverProvisionDto,
  SolicitarProvisionDto,
} from "./dto";

function usuarioId(user: AuthenticatedUser): string {
  if (!user?.id) throw new UnauthorizedException("Usuario sin id resuelto");
  return user.id;
}

@ApiTags("provisiones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProvisionesController {
  constructor(@Inject(ProvisionesService) private readonly service: ProvisionesService) {}

  @Get("provisiones")
  listar(@Query() filtro: FiltroProvisionesDto) {
    return this.service.listar(filtro);
  }

  @Get("atenciones/:atencionId/provisiones")
  listarPorAtencion(@Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(atencionId);
  }

  @Post("atenciones/:atencionId/provisiones")
  @Roles("Administrador", "Supervisor", "Abogado")
  solicitar(
    @CurrentUser() user: AuthenticatedUser,
    @Param("atencionId") atencionId: string,
    @Body() body: SolicitarProvisionDto,
  ) {
    return this.service.solicitar(atencionId, usuarioId(user), body);
  }

  @Put("provisiones/:id/aprobar")
  @Roles("Administrador", "Supervisor")
  aprobar(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ResolverProvisionDto,
  ) {
    return this.service.resolver(id, usuarioId(user), "Aprobada", body.observacion);
  }

  @Put("provisiones/:id/rechazar")
  @Roles("Administrador", "Supervisor")
  rechazar(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ResolverProvisionDto,
  ) {
    return this.service.resolver(id, usuarioId(user), "Rechazada", body.observacion);
  }

  @Get("provisiones/:id/movimientos")
  movimientos(@Param("id") id: string) {
    return this.service.listarMovimientos(id);
  }

  @Post("provisiones/:id/movimientos")
  @Roles("Administrador", "Supervisor", "Abogado")
  registrarMovimiento(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: RegistrarMovimientoDto,
  ) {
    return this.service.registrarMovimiento(id, usuarioId(user), body);
  }
}
