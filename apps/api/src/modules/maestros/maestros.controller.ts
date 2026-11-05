import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiParam, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { TipoAtencionEnum } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MAESTROS, MaestrosService } from "./maestros.service";

const FiltroMaestroSchema = z.object({
  vigente: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  competenciaId: z.string().uuid().optional(),
  aplicaA: TipoAtencionEnum.optional(),
});
class FiltroMaestroDto extends createZodDto(FiltroMaestroSchema) {}

const tipos = Object.keys(MAESTROS);

// Un endpoint por maestro: /maestros/competencias, /maestros/materias, etc.
// El body se valida contra el esquema Zod de cada maestro en el servicio.
@ApiTags("maestros")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("maestros")
export class MaestrosController {
  constructor(@Inject(MaestrosService) private readonly service: MaestrosService) {}

  @Get(":tipo")
  @ApiParam({ name: "tipo", enum: tipos })
  listar(@Param("tipo") tipo: string, @Query() filtro: FiltroMaestroDto) {
    return this.service.listar(tipo, filtro);
  }

  @Post(":tipo")
  @Roles("Administrador")
  @ApiParam({ name: "tipo", enum: tipos })
  crear(@Param("tipo") tipo: string, @Body() body: unknown) {
    return this.service.crear(tipo, body);
  }

  @Put(":tipo/:id")
  @Roles("Administrador")
  @ApiParam({ name: "tipo", enum: tipos })
  actualizar(@Param("tipo") tipo: string, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.service.actualizar(tipo, id, body);
  }
}
