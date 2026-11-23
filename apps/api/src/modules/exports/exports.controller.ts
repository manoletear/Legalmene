import { BadRequestException, Controller, Get, Header, Inject, Param, Query, Res, UseGuards } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { BUSQUEDAS_EXPORTABLES, CriteriosBusquedaSchema, type BusquedaExportable } from "@legalmene/shared";
import { MIME_XLSX } from "./xlsx";
import { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ExportsService } from "./exports.service";
import { AtencionPdfService } from "./atencion-pdf.service";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";

class FiltroExportacionDto extends createZodDto(
  CriteriosBusquedaSchema.extend({
    estado: z.string().optional(),
    q: z.string().trim().min(1).optional(),
    vigencia: z.string().optional(),
    ordenCompra: z.string().trim().min(1).optional(),
  }),
) {}

@ApiTags("exports")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("exports")
export class ExportsController {
  constructor(
    @Inject(ExportsService) private readonly service: ExportsService,
    @Inject(AtencionPdfService) private readonly pdf: AtencionPdfService,
  ) {}

  // Búsquedas del Anexo §XI en XLSX. Mismos criterios y alcance que la pantalla de búsqueda.
  @Get("busquedas/:tipo.xlsx")
  @Permiso("exportar.datos")
  async busqueda(@Param("tipo") tipo: string, @Query() filtro: FiltroExportacionDto, @Res() res: Response) {
    if (!(BUSQUEDAS_EXPORTABLES as readonly string[]).includes(tipo)) {
      throw new BadRequestException(`Búsqueda ${tipo} no exportable`);
    }
    const { archivo } = await this.service.busqueda(tipo as BusquedaExportable, filtro);
    res.setHeader("Content-Type", MIME_XLSX);
    res.setHeader("Content-Disposition", `attachment; filename="${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(archivo);
  }

  @Get("atenciones/:id.pdf")
  @Header("Content-Type", "application/pdf")
  async atencionPdf(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Disposition", `attachment; filename="atencion-${id}.pdf"`);
    await this.pdf.generar(id, res);
  }
}
