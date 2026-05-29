import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { PagosService } from "./pagos.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { IniciarPago } from "@legalmene/shared";

@ApiTags("pagos")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("pagos")
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Get()
  listar(
    @CodPlan() codPlan: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("estado") estado?: string,
  ) {
    return this.service.listar(codPlan, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      estado,
    });
  }

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
