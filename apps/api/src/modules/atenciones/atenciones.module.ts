import { Module } from "@nestjs/common";
import { AtencionesController } from "./atenciones.controller";
import { AtencionesService } from "./atenciones.service";
import { DerivacionesController } from "./derivaciones.controller";
import { DerivacionesService } from "./derivaciones.service";
import { GestionesModule } from "../gestiones/gestiones.module";

@Module({
  imports: [GestionesModule],
  controllers: [AtencionesController, DerivacionesController],
  providers: [AtencionesService, DerivacionesService],
  exports: [AtencionesService],
})
export class AtencionesModule {}
