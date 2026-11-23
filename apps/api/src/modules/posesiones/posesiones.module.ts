import { Module } from "@nestjs/common";
import { AtencionesModule } from "../atenciones/atenciones.module";
import { PosesionesController } from "./posesiones.controller";
import { PosesionesService } from "./posesiones.service";
import { PosesionPdfService } from "./posesion-pdf.service";

@Module({
  imports: [AtencionesModule],
  controllers: [PosesionesController],
  providers: [PosesionesService, PosesionPdfService],
})
export class PosesionesModule {}
