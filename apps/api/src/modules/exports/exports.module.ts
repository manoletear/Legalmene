import { Module } from "@nestjs/common";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";
import { AtencionPdfService } from "./atencion-pdf.service";
import { ComprobantesPdfService } from "./comprobantes-pdf.service";

@Module({
  controllers: [ExportsController],
  providers: [ExportsService, AtencionPdfService, ComprobantesPdfService],
})
export class ExportsModule {}
