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
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags, ApiHeader } from "@nestjs/swagger";
import { CargasMasivasService } from "./cargas-masivas.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { TipoCargaMasiva } from "@legalmene/shared";

@ApiTags("cargas-masivas")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(AuthGuard("jwt-entra"), RolesGuard)
@Controller("cargas-masivas")
export class CargasMasivasController {
  constructor(private readonly service: CargasMasivasService) {}

  @Post("afiliados")
  @Roles("Administrador", "Supervisor")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { archivo: { type: "string", format: "binary" } },
      required: ["archivo"],
    },
  })
  async cargarAfiliados(
    @CodPlan() codPlan: string,
    @Query("tipo") tipo: TipoCargaMasiva,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Archivo requerido (multipart field 'archivo')");
    if (!tipo || (tipo !== "FLUJO" && tipo !== "STOCK")) {
      throw new BadRequestException("Query param 'tipo' debe ser FLUJO o STOCK");
    }
    return this.service.cargarAfiliados(codPlan, tipo, file.buffer);
  }
}
