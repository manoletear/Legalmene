import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { PagosService } from "./pagos.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { IniciarPago } from "@legalmene/shared";

@ApiTags("pagos")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(AuthGuard("jwt-entra"), RolesGuard)
@Controller("pagos")
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Post("iniciar")
  @Roles("Administrador", "Supervisor", "Operador")
  iniciar(@CodPlan() codPlan: string, @Body() body: IniciarPago) {
    return this.service.iniciar(codPlan, body);
  }

  // Endpoint llamado por el callback de Transbank (sin auth en producción se usa
  // verificación HMAC del token en vez de JWT).
  @Post("confirmar")
  confirmar(@Body() body: { ordenCompra: string; authCode: string; exitoso: boolean }) {
    return this.service.confirmar(body.ordenCompra, body.authCode, body.exitoso);
  }
}
