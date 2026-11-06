import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { createZodDto } from "nestjs-zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CargasMasivasService } from "./cargas-masivas.service";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { MIME_XLSX } from "../exports/xlsx";
import { CargaMasivaResultadoSchema, EntidadCargaMasivaEnum, type TipoCargaMasiva } from "@legalmene/shared";

class ResumenDto extends createZodDto(CargaMasivaResultadoSchema) {}

@ApiTags("cargas-masivas")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("cargas-masivas")
export class CargasMasivasController {
  constructor(@Inject(CargasMasivasService) private readonly service: CargasMasivasService) {}

  // Reporte XLSX (Resumen + Errores) de una carga recién ejecutada.
  @Post("resumen.xlsx")
  @Permiso("cargas.ejecutar")
  async resumen(@Body() body: ResumenDto, @Res() res: Response) {
    const archivo = await this.service.resumenXlsx(body);
    res.setHeader("Content-Type", MIME_XLSX);
    res.setHeader("Content-Disposition", `attachment; filename="carga-${body.entidad}-${body.codPlan}.xlsx"`);
    res.send(archivo);
  }

  // :entidad = afiliados (nómina), cargas (familiares) o bienes, siempre de un plan.
  @Post(":entidad")
  @Permiso("cargas.ejecutar")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "codPlan", required: true, description: "Plan al que corresponde el archivo" })
  @ApiQuery({ name: "tipo", required: true, description: "FLUJO o STOCK" })
  @ApiBody({
    schema: {
      type: "object",
      properties: { archivo: { type: "string", format: "binary" } },
      required: ["archivo"],
    },
  })
  async cargar(
    @Param("entidad") entidad: string,
    @Query("codPlan") codPlan: string,
    @Query("tipo") tipo: TipoCargaMasiva,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const e = EntidadCargaMasivaEnum.safeParse(entidad);
    if (!e.success) throw new BadRequestException("La carga debe ser de afiliados, cargas o bienes");
    if (!file) throw new BadRequestException("Archivo requerido (multipart field 'archivo')");
    if (!codPlan) throw new BadRequestException("Query param 'codPlan' es obligatorio");
    if (!tipo || (tipo !== "FLUJO" && tipo !== "STOCK")) {
      throw new BadRequestException("Query param 'tipo' debe ser FLUJO o STOCK");
    }
    if (e.data === "cargas") return this.service.cargarCargas(codPlan, tipo, file.buffer);
    if (e.data === "bienes") return this.service.cargarBienes(codPlan, tipo, file.buffer);
    return this.service.cargarAfiliados(codPlan, tipo, file.buffer);
  }
}
