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
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
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
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProvisionesController {
  constructor(@Inject(ProvisionesService) private readonly service: ProvisionesService) {}

  @Get("provisiones")
  listar(@CodPlan() codPlan: string, @Query() filtro: FiltroProvisionesDto) {
    return this.service.listar(codPlan, filtro);
  }

  @Get("atenciones/:atencionId/provisiones")
  listarPorAtencion(@CodPlan() codPlan: string, @Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(codPlan, atencionId);
  }

  @Post("atenciones/:atencionId/provisiones")
  @Roles("Administrador", "Supervisor", "Abogado")
  solicitar(
    @CodPlan() codPlan: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("atencionId") atencionId: string,
    @Body() body: SolicitarProvisionDto,
  ) {
    return this.service.solicitar(codPlan, atencionId, usuarioId(user), body);
  }

  @Put("provisiones/:id/aprobar")
  @Roles("Administrador", "Supervisor")
  aprobar(
    @CodPlan() codPlan: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ResolverProvisionDto,
  ) {
    return this.service.resolver(codPlan, id, usuarioId(user), "Aprobada", body.observacion);
  }

  @Put("provisiones/:id/rechazar")
  @Roles("Administrador", "Supervisor")
  rechazar(
    @CodPlan() codPlan: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: ResolverProvisionDto,
  ) {
    return this.service.resolver(codPlan, id, usuarioId(user), "Rechazada", body.observacion);
  }

  @Get("provisiones/:id/movimientos")
  movimientos(@CodPlan() codPlan: string, @Param("id") id: string) {
    return this.service.listarMovimientos(codPlan, id);
  }

  @Post("provisiones/:id/movimientos")
  @Roles("Administrador", "Supervisor", "Abogado")
  registrarMovimiento(
    @CodPlan() codPlan: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: RegistrarMovimientoDto,
  ) {
    return this.service.registrarMovimiento(codPlan, id, usuarioId(user), body);
  }
}
