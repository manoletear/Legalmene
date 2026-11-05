import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PagosService } from "./pagos.service";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { IniciarPagoSchema } from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";

class IniciarPagoDto extends createZodDto(IniciarPagoSchema) {}

@ApiTags("pagos")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("pagos")
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Get()
  @Permiso("pagos.ver")
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
  @Permiso("pagos.iniciar")
  iniciar(@Body() body: IniciarPagoDto) {
    return this.service.iniciar(body);
  }

  // Mientras WebPay sea un stub, confirmar a mano un pago lo marca como cobrado: solo con
  // permiso explícito. El callback real de Transbank se validará con HMAC, no con JWT.
  @Post("confirmar")
  @Permiso("pagos.confirmar")
  confirmar(@Body() body: { ordenCompra: string; authCode: string; exitoso: boolean }) {
    return this.service.confirmar(body.ordenCompra, body.authCode, body.exitoso);
  }
}
