import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PagosService } from "./pagos.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { IniciarPagoSchema } from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";

class IniciarPagoDto extends createZodDto(IniciarPagoSchema) {}

@ApiTags("pagos")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("pagos")
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Get()
  listar(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("estado") estado?: string,
    @Query("codPlan") codPlan?: string,
  ) {
    return this.service.listar({
      codPlan,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      estado,
    });
  }

  @Post("iniciar")
  @Roles("Administrador", "Supervisor", "Operador")
  iniciar(@Body() body: IniciarPagoDto) {
    return this.service.iniciar(body);
  }

  // Endpoint llamado por el callback de Transbank (sin auth en producción se usa
  // verificación HMAC del token en vez de JWT).
  @Post("confirmar")
  confirmar(@Body() body: { ordenCompra: string; authCode: string; exitoso: boolean }) {
    return this.service.confirmar(body.ordenCompra, body.authCode, body.exitoso);
  }
}
