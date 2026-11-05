import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { CreateCoberturaSchema, TipoAtencionEnum, UpdateCoberturaSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CoberturasService } from "./coberturas.service";

class CreateCoberturaDto extends createZodDto(CreateCoberturaSchema) {}
class UpdateCoberturaDto extends createZodDto(UpdateCoberturaSchema) {}

const FiltroCoberturasSchema = z.object({
  codPlan: z.string().optional(),
  vigente: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
class FiltroCoberturasDto extends createZodDto(FiltroCoberturasSchema) {}

const CopagoQuerySchema = z.object({
  codPlan: z.string().min(1),
  materiaId: z.string().uuid(),
  tipo: TipoAtencionEnum,
});
class CopagoQueryDto extends createZodDto(CopagoQuerySchema) {}

@ApiTags("coberturas")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class CoberturasController {
  constructor(@Inject(CoberturasService) private readonly service: CoberturasService) {}

  @Get("coberturas")
  listar(@Query() filtro: FiltroCoberturasDto) {
    return this.service.listar(filtro);
  }

  @Post("coberturas")
  @Permiso("coberturas.administrar")
  crear(@Body() body: CreateCoberturaDto) {
    return this.service.crear(body);
  }

  @Put("coberturas/:id")
  @Permiso("coberturas.administrar")
  actualizar(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateCoberturaDto) {
    return this.service.actualizar(id, body);
  }

  // Vista previa: cuánto pagaría un afiliado del plan por esa materia y tipo.
  @Get("copago")
  copago(@Query() q: CopagoQueryDto) {
    return this.service.copago(q.codPlan, q.materiaId, q.tipo);
  }

  @Get("atenciones/:id/copago")
  copagoAtencion(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.copagoAtencion(id);
  }
}
