import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PagosService } from "./pagos.service";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CriteriosBusquedaSchema, IniciarPagoSchema } from "@legalmene/shared";
import { z } from "zod";
import { createZodDto } from "nestjs-zod";

class IniciarPagoDto extends createZodDto(IniciarPagoSchema) {}
class FiltroPagosDto extends createZodDto(
  CriteriosBusquedaSchema.pick({ rut: true, codPlan: true, fechaDesde: true, fechaHasta: true }).extend({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    estado: z.string().optional(),
    ordenCompra: z.string().trim().min(1).optional(),
  }),
) {}

@ApiTags("pagos")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("pagos")
export class PagosController {
  constructor(private readonly service: PagosService) {}

  @Get()
  @Permiso("pagos.ver")
  listar(@Query() filtro: FiltroPagosDto) {
    return this.service.listar(filtro);
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
