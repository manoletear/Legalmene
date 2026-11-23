import { BadRequestException, Controller, Get, Header, Inject, Param, ParseUUIDPipe, Query, Res, UseGuards } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { BUSQUEDAS_EXPORTABLES, CriteriosBusquedaSchema, type BusquedaExportable } from "@legalmene/shared";
import { MIME_XLSX } from "./xlsx";
import { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ExportsService } from "./exports.service";
import { AtencionPdfService } from "./atencion-pdf.service";
import { ComprobantesPdfService, dibujarComprobante, type Comprobante } from "./comprobantes-pdf.service";
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
    @Inject(ComprobantesPdfService) private readonly comprobantes: ComprobantesPdfService,
  ) {}

  private enviarComprobante(c: Comprobante, archivo: string, res: Response) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${archivo}"`);
    dibujarComprobante(c, res);
  }

  // Anexo §IX 5.4: comprobante del pago del arancel en dos copias (administración y cliente).
  @Get("comprobantes/arancel/:atencionId.pdf")
  @Permiso("finanzas.ver")
  async reciboArancel(@Param("atencionId", ParseUUIDPipe) atencionId: string, @Res() res: Response) {
    const c = await this.comprobantes.reciboArancel(atencionId);
    this.enviarComprobante(c, `comprobante-arancel-${c.numero}.pdf`, res);
  }

  // Anexo §X 19: rendición de fondos al cliente, en tres copias.
  @Get("comprobantes/rendicion/:atencionId.pdf")
  @Permiso("finanzas.ver")
  async rendicionCliente(@Param("atencionId", ParseUUIDPipe) atencionId: string, @Res() res: Response) {
    const c = await this.comprobantes.rendicionCliente(atencionId);
    this.enviarComprobante(c, `rendicion-${c.numero}.pdf`, res);
  }

  // Anexo §X 05.1: recibo del dinero de una provisión, en dos copias.
  @Get("comprobantes/provision/:provisionId.pdf")
  @Permiso("finanzas.ver")
  async reciboProvision(@Param("provisionId", ParseUUIDPipe) provisionId: string, @Res() res: Response) {
    const c = await this.comprobantes.reciboProvision(provisionId);
    this.enviarComprobante(c, `comprobante-provision-${c.numero}.pdf`, res);
  }

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
