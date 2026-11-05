import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { EstadoArancelAtencionEnum, ObservacionSchema, PagoArancelSchema, RechazoSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { ArancelesAtencionService } from "./aranceles-atencion.service";

class PagoArancelDto extends createZodDto(PagoArancelSchema) {}
class ObservacionDto extends createZodDto(ObservacionSchema) {}
class RechazoDto extends createZodDto(RechazoSchema) {}
class FiltroDto extends createZodDto(z.object({ estado: EstadoArancelAtencionEnum.optional() })) {}

function uid(user: AuthenticatedUser): string {
  if (!user?.id) throw new UnauthorizedException("Usuario sin id resuelto");
  return user.id;
}

@ApiTags("aranceles")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ArancelesAtencionController {
  constructor(@Inject(ArancelesAtencionService) private readonly service: ArancelesAtencionService) {}

  // Bandeja de finanzas: aranceles por estado (p. ej. Aprobado = pendiente de pago).
  @Get("aranceles-atencion")
  listar(@Query() f: FiltroDto) {
    return this.service.listar(f.estado);
  }

  @Get("atenciones/:id/arancel")
  obtener(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.obtener(id);
  }

  @Get("atenciones/:id/arancel/eventos")
  eventos(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.eventos(id);
  }

  @Post("atenciones/:id/arancel/enviar")
  @Roles("Administrador", "Supervisor", "Abogado")
  enviar(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.enviarAprobacion(id, uid(user));
  }

  @Post("atenciones/:id/arancel/aprobar")
  @Roles("Administrador", "Supervisor")
  aprobar(@Param("id", ParseUUIDPipe) id: string, @Body() body: ObservacionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.aprobar(id, uid(user), body.observacion);
  }

  @Post("atenciones/:id/arancel/rechazar")
  @Roles("Administrador", "Supervisor")
  rechazar(@Param("id", ParseUUIDPipe) id: string, @Body() body: RechazoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.rechazar(id, uid(user), body.observacion);
  }

  @Post("atenciones/:id/arancel/pago")
  @Roles("Administrador", "Contador")
  pago(@Param("id", ParseUUIDPipe) id: string, @Body() body: PagoArancelDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.registrarPago(id, uid(user), body);
  }
}
