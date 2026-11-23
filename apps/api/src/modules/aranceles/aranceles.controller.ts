import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { ArancelesService } from "./aranceles.service";
import { CreateArancelDto, FiltroArancelesDto, UpdateArancelDto, ValorUfDto } from "./dto";

@ApiTags("aranceles")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class ArancelesController {
  constructor(@Inject(ArancelesService) private readonly service: ArancelesService) {}

  @Get("aranceles")
  listar(@Query() filtro: FiltroArancelesDto) {
    return this.service.listar(filtro);
  }

  @Post("aranceles")
  @Permiso("aranceles.administrar")
  crear(@Body() body: CreateArancelDto) {
    return this.service.crear(body);
  }

  @Put("aranceles/:id")
  @Permiso("aranceles.administrar")
  actualizar(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateArancelDto) {
    return this.service.actualizar(id, body);
  }

  @Get("valores-uf/vigente")
  ufVigente() {
    return this.service.ufVigente();
  }

  // La UF es nacional (no por plan): solo Administrador la actualiza.
  @Put("valores-uf")
  @Permiso("valores_uf.registrar")
  registrarUf(@Body() body: ValorUfDto) {
    return this.service.registrarUf(body);
  }
}
