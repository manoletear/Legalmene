import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { DerivacionesService } from "./derivaciones.service";
import { AprobarDerivacionDto, FiltroDerivacionesDto, RechazarDerivacionDto, SolicitarDerivacionDto } from "./dto";

function conId(user: AuthenticatedUser): { id: string; rol: string } {
  if (!user?.id) throw new UnauthorizedException("Usuario sin id resuelto");
  return { id: user.id, rol: user.rol };
}

@ApiTags("derivaciones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DerivacionesController {
  constructor(@Inject(DerivacionesService) private readonly service: DerivacionesService) {}

  @Get("derivaciones")
  listar(@Query() filtro: FiltroDerivacionesDto) {
    return this.service.listar(filtro);
  }

  @Post("atenciones/:id/derivaciones")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  solicitar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SolicitarDerivacionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.solicitar(id, conId(user).id, body);
  }

  @Post("derivaciones/:id/aprobar")
  @Roles("Administrador", "Supervisor")
  aprobar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AprobarDerivacionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.aprobar(id, conId(user), body);
  }

  @Post("derivaciones/:id/rechazar")
  @Roles("Administrador", "Supervisor")
  rechazar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: RechazarDerivacionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.rechazar(id, conId(user), body);
  }
}
