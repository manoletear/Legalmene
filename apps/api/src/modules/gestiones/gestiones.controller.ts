import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { GestionesService, FiltroGestiones } from "./gestiones.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { CreateGestion, CompletarGestion } from "@legalmene/shared";

@ApiTags("gestiones")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class GestionesController {
  constructor(private readonly service: GestionesService) {}

  // Listado global per tenant para vista operacional.
  @Get("gestiones")
  listarGlobal(
    @CodPlan() codPlan: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("estado") estado?: FiltroGestiones["estado"],
    @Query("tipo") tipo?: string,
    @Query("responsableId") responsableId?: string,
    @Query("soloVencidas") soloVencidas?: string,
  ) {
    return this.service.listarPorPlan(codPlan, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      estado,
      tipo,
      responsableId,
      soloVencidas: soloVencidas === "true",
    });
  }

  @Get("atenciones/:atencionId/gestiones")
  listar(@CodPlan() codPlan: string, @Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(codPlan, atencionId);
  }

  @Post("atenciones/:atencionId/gestiones")
  @Roles("Administrador", "Supervisor", "Abogado")
  crear(
    @CodPlan() codPlan: string,
    @Param("atencionId") atencionId: string,
    @Body() body: Omit<CreateGestion, "atencionId">,
  ) {
    return this.service.crear(codPlan, { ...body, atencionId });
  }

  @Put("gestiones/:id/completar")
  @Roles("Administrador", "Supervisor", "Abogado")
  completar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @Body() body: CompletarGestion,
  ) {
    return this.service.completar(codPlan, id, body);
  }
}
