import { Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { OpenSearchService } from "./opensearch.service";

@ApiTags("admin")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("admin/busqueda")
export class BusquedaController {
  constructor(@Inject(OpenSearchService) private readonly service: OpenSearchService) {}

  @Get("estado")
  @Permiso("busqueda.administrar")
  estado() {
    return this.service.estado();
  }

  @Post("reindexar")
  @Permiso("busqueda.administrar")
  reindexar() {
    return this.service.reindexar();
  }
}
