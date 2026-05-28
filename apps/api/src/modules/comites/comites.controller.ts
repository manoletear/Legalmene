import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { ComitesService } from "./comites.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { ConvocarComite } from "@legalmene/shared";

@ApiTags("comites")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(AuthGuard("jwt-entra"), RolesGuard)
@Controller()
export class ComitesController {
  constructor(private readonly service: ComitesService) {}

  @Get("atenciones/:atencionId/comites")
  listar(@CodPlan() codPlan: string, @Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(codPlan, atencionId);
  }

  @Post("atenciones/:atencionId/comites")
  @Roles("Administrador", "Supervisor")
  convocar(
    @CodPlan() codPlan: string,
    @Param("atencionId") atencionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Omit<ConvocarComite, "atencionId">,
  ) {
    // user.id se pobla por el AuthInterceptor (ver auth/auth.module.ts más adelante).
    // En esta primera versión usamos entraOid si no hay id local todavía.
    const convocadoPor = user.id ?? user.entraOid;
    return this.service.convocar(codPlan, convocadoPor, { ...body, atencionId });
  }

  @Post("comites/:id/votos")
  @Roles("Administrador", "Supervisor", "Abogado")
  votar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { voto: "AFavor" | "EnContra" | "Abstencion"; comentario?: string },
  ) {
    return this.service.votar(codPlan, id, user.id ?? user.entraOid, body.voto, body.comentario);
  }

  @Post("comites/:id/cerrar")
  @Roles("Administrador", "Supervisor")
  cerrar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @Body() body: { decision: "Aprobado" | "Rechazado" | "Diferido"; acta: string },
  ) {
    return this.service.cerrar(codPlan, id, body.decision, body.acta);
  }
}
