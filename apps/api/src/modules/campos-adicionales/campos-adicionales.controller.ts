import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { ActualizarCampoAdicionalSchema, CrearCampoAdicionalSchema, GuardarCamposAdicionalesSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { CamposAdicionalesService } from "./campos-adicionales.service";

class CrearDto extends createZodDto(CrearCampoAdicionalSchema) {}
class ActualizarDto extends createZodDto(ActualizarCampoAdicionalSchema) {}
class GuardarDto extends createZodDto(GuardarCamposAdicionalesSchema) {}

@ApiTags("campos-adicionales")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class CamposAdicionalesController {
  constructor(@Inject(CamposAdicionalesService) private readonly service: CamposAdicionalesService) {}

  @Get("campos-adicionales")
  listar(@Query("todos") todos?: string) {
    return this.service.listar(todos !== "true");
  }

  @Post("campos-adicionales")
  @Permiso("maestros.administrar")
  crear(@Body() body: CrearDto) {
    return this.service.crear(body);
  }

  @Patch("campos-adicionales/:id")
  @Permiso("maestros.administrar")
  actualizar(@Param("id", ParseUUIDPipe) id: string, @Body() body: ActualizarDto) {
    return this.service.actualizar(id, body);
  }

  @Get("atenciones/:id/campos-adicionales")
  deAtencion(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.deAtencion(id);
  }

  @Put("atenciones/:id/campos-adicionales")
  @Permiso("atenciones.editar")
  guardar(@Param("id", ParseUUIDPipe) id: string, @Body() body: GuardarDto) {
    return this.service.guardar(id, body.valores);
  }
}
