import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DocumentosService } from "./documentos.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("documentos")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DocumentosController {
  constructor(private readonly service: DocumentosService) {}

  @Post("documentos/upload-url")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  obtenerUploadUrl(
    @CodPlan() codPlan: string,
    @Body() body: { atencionId?: string; nombre: string; mimeType: string; tamanoBytes: number },
  ) {
    return this.service.generateUploadUrl(codPlan, body);
  }

  @Post("documentos")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  registrar(
    @CodPlan() codPlan: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      atencionId?: string;
      nombre: string;
      mimeType: string;
      tamanoBytes: number;
      s3Key: string;
      sha256: string;
    },
  ) {
    return this.service.register(codPlan, { ...body, subidoPor: user.id ?? user.entraOid });
  }

  @Get("documentos/:id/download-url")
  obtenerDownloadUrl(@CodPlan() codPlan: string, @Param("id") id: string) {
    return this.service.generateDownloadUrl(codPlan, id);
  }

  @Get("atenciones/:atencionId/documentos")
  listarPorAtencion(@CodPlan() codPlan: string, @Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(codPlan, atencionId);
  }
}
