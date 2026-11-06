import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { GestionesService, FiltroGestiones } from "./gestiones.service";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import type { CreateGestion, CompletarGestion } from "@legalmene/shared";

@ApiTags("gestiones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class GestionesController {
  constructor(private readonly service: GestionesService) {}

  // Listado global para vista operacional, opcionalmente por plan.
  @Get("gestiones")
  listarGlobal(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("estado") estado?: FiltroGestiones["estado"],
    @Query("tipo") tipo?: string,
    @Query("responsableId") responsableId?: string,
    @Query("soloVencidas") soloVencidas?: string,
    @Query("codPlan") codPlan?: string,
  ) {
    return this.service.listarGlobal({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      estado,
      tipo,
      responsableId,
      soloVencidas: soloVencidas === "true",
      codPlan,
    });
  }

  @Get("atenciones/:atencionId/gestiones")
  listar(@Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(atencionId);
  }

  @Post("atenciones/:atencionId/gestiones")
  @Permiso("gestiones.registrar")
  crear(
    @Param("atencionId") atencionId: string,
    @Body() body: Omit<CreateGestion, "atencionId">,
  ) {
    return this.service.crear({ ...body, atencionId });
  }

  @Put("gestiones/:id/completar")
  @Permiso("gestiones.registrar")
  completar(
    @Param("id") id: string,
    @Body() body: CompletarGestion,
  ) {
    return this.service.completar(id, body);
  }
}
