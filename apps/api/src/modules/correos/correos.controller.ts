import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { CorreosService } from "./correos.service";

@ApiTags("correos")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller()
export class CorreosController {
  constructor(@Inject(CorreosService) private readonly service: CorreosService) {}

  // Bitácora de correos de la atención (sin el cuerpo).
  @Get("atenciones/:id/correos")
  deAtencion(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.deAtencion(id);
  }
}
