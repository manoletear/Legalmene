import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ComitesService } from "./comites.service";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { ConvocarComite } from "@legalmene/shared";

@ApiTags("comites")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ComitesController {
  constructor(private readonly service: ComitesService) {}

  @Get("atenciones/:atencionId/comites")
  listar(@Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(atencionId);
  }

  @Post("atenciones/:atencionId/comites")
  @Roles("Administrador", "Supervisor")
  convocar(
    @Param("atencionId") atencionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Omit<ConvocarComite, "atencionId">,
  ) {
    // user.id se pobla por el AuthInterceptor (ver auth/auth.module.ts más adelante).
    // En esta primera versión usamos entraOid si no hay id local todavía.
    const convocadoPor = user.id ?? user.entraOid;
    return this.service.convocar(convocadoPor, { ...body, atencionId });
  }

  @Post("comites/:id/votos")
  @Roles("Administrador", "Supervisor", "Abogado")
  votar(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { voto: "AFavor" | "EnContra" | "Abstencion"; comentario?: string },
  ) {
    return this.service.votar(id, user.id ?? user.entraOid, body.voto, body.comentario);
  }

  @Post("comites/:id/cerrar")
  @Roles("Administrador", "Supervisor")
  cerrar(
    @Param("id") id: string,
    @Body() body: { decision: "Aprobado" | "Rechazado" | "Diferido"; acta: string },
  ) {
    return this.service.cerrar(id, body.decision, body.acta);
  }
}
