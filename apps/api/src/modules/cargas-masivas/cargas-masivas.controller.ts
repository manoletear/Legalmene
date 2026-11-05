import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CargasMasivasService } from "./cargas-masivas.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { TipoCargaMasiva } from "@legalmene/shared";

@ApiTags("cargas-masivas")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("cargas-masivas")
export class CargasMasivasController {
  constructor(private readonly service: CargasMasivasService) {}

  @Post("afiliados")
  @Roles("Administrador", "Supervisor")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "codPlan", required: true, description: "Plan al que corresponde la nómina" })
  @ApiBody({
    schema: {
      type: "object",
      properties: { archivo: { type: "string", format: "binary" } },
      required: ["archivo"],
    },
  })
  async cargarAfiliados(
    @Query("codPlan") codPlan: string,
    @Query("tipo") tipo: TipoCargaMasiva,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Archivo requerido (multipart field 'archivo')");
    if (!codPlan) throw new BadRequestException("Query param 'codPlan' es obligatorio");
    if (!tipo || (tipo !== "FLUJO" && tipo !== "STOCK")) {
      throw new BadRequestException("Query param 'tipo' debe ser FLUJO o STOCK");
    }
    return this.service.cargarAfiliados(codPlan, tipo, file.buffer);
  }
}
