import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DocumentosService } from "./documentos.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { CurrentUser, AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { LocalStorage } from "./local.storage";

@ApiTags("documentos")
@ApiBearerAuth("EntraID")
@Controller()
export class DocumentosController {
  constructor(
    private readonly service: DocumentosService,
    private readonly localStorage: LocalStorage,
  ) {}

  @Post("documentos/upload-url")
  @ApiHeader({ name: "X-Cod-Plan", required: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  obtenerUploadUrl(
    @CodPlan() codPlan: string,
    @Body() body: { atencionId?: string; nombre: string; mimeType: string; tamanoBytes: number },
  ) {
    return this.service.generateUploadUrl(codPlan, body);
  }

  @Post("documentos")
  @ApiHeader({ name: "X-Cod-Plan", required: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @ApiHeader({ name: "X-Cod-Plan", required: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
  obtenerDownloadUrl(@CodPlan() codPlan: string, @Param("id") id: string) {
    return this.service.generateDownloadUrl(codPlan, id);
  }

  @Get("atenciones/:atencionId/documentos")
  @ApiHeader({ name: "X-Cod-Plan", required: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
  listarPorAtencion(@CodPlan() codPlan: string, @Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(codPlan, atencionId);
  }

  // Endpoints internos del LocalStorage backend (HMAC-firmados, no JWT).
  // En producción no se exponen porque STORAGE_BACKEND != local.
  @Put("documentos/local/:key")
  @ApiExcludeEndpoint()
  async localPut(@Param("key") key: string, @Req() req: Request, @Res() res: Response) {
    await this.localStorage.handlePut(req, res, decodeURIComponent(key));
  }

  @Get("documentos/local/:key")
  @ApiExcludeEndpoint()
  localGet(@Param("key") key: string, @Req() req: Request, @Res() res: Response) {
    this.localStorage.handleGet(req, res, decodeURIComponent(key));
  }
}
