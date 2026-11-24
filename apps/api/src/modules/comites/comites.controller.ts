import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ComitesService } from "./comites.service";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CerrarComiteSchema, ConvocarComiteBodySchema, CrearCompromisoSchema, ValidarCompromisoSchema, VotarComiteSchema } from "@legalmene/shared";

class CrearCompromisoDto extends createZodDto(CrearCompromisoSchema) {}
class ValidarCompromisoDto extends createZodDto(ValidarCompromisoSchema) {}
class ConvocarComiteDto extends createZodDto(ConvocarComiteBodySchema) {}
class VotarComiteDto extends createZodDto(VotarComiteSchema) {}
class CerrarComiteDto extends createZodDto(CerrarComiteSchema) {}

@ApiTags("comites")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class ComitesController {
  constructor(private readonly service: ComitesService) {}

  @Get("atenciones/:atencionId/comites")
  listar(@Param("atencionId", ParseUUIDPipe) atencionId: string) {
    return this.service.listarPorAtencion(atencionId);
  }

  @Post("atenciones/:atencionId/comites")
  @Permiso("comites.convocar")
  convocar(
    @Param("atencionId", ParseUUIDPipe) atencionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ConvocarComiteDto,
  ) {
    // user.id se pobla por el AuthInterceptor (ver auth/auth.module.ts más adelante).
    // En esta primera versión usamos entraOid si no hay id local todavía.
    const convocadoPor = user.id ?? user.entraOid;
    return this.service.convocar(convocadoPor, { ...body, atencionId });
  }

  @Post("comites/:id/votos")
  @Permiso("comites.votar")
  votar(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: VotarComiteDto,
  ) {
    return this.service.votar(id, user.id ?? user.entraOid, body.voto, body.comentario);
  }

  @Post("comites/:id/cerrar")
  @Permiso("comites.convocar")
  cerrar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CerrarComiteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cerrar(id, body.decision, body.acta, user.id);
  }

  // Bitácora del comité: compromisos propios y de comités anteriores por validar.
  @Get("comites/:id/compromisos")
  bitacora(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.bitacora(id);
  }

  @Post("comites/:id/compromisos")
  @Permiso("comites.votar")
  agregarCompromiso(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: CrearCompromisoDto) {
    return this.service.agregarCompromiso(id, user, body);
  }

  @Post("comites/:id/compromisos/:compromisoId/validar")
  @Permiso("comites.convocar")
  validarCompromiso(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("compromisoId", ParseUUIDPipe) compromisoId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ValidarCompromisoDto,
  ) {
    return this.service.validarCompromiso(id, compromisoId, user.id, body);
  }
}
