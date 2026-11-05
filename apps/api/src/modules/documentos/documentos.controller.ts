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
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DocumentosService } from "./documentos.service";
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  obtenerUploadUrl(
    @Body() body: { atencionId?: string; nombre: string; mimeType: string; tamanoBytes: number },
  ) {
    return this.service.generateUploadUrl(body);
  }

  @Post("documentos")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  registrar(
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
    return this.service.register({ ...body, subidoPor: user.id ?? user.entraOid });
  }

  @Get("documentos/:id/download-url")
  @UseGuards(JwtAuthGuard, RolesGuard)
  obtenerDownloadUrl(@Param("id") id: string) {
    return this.service.generateDownloadUrl(id);
  }

  @Get("atenciones/:atencionId/documentos")
  @UseGuards(JwtAuthGuard, RolesGuard)
  listarPorAtencion(@Param("atencionId") atencionId: string) {
    return this.service.listarPorAtencion(atencionId);
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
