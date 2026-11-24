import { Module } from "@nestjs/common";
import { AtencionesController } from "./atenciones.controller";
import { AtencionesService } from "./atenciones.service";
import { DerivacionesController } from "./derivaciones.controller";
import { DerivacionesService } from "./derivaciones.service";
import { PlazosService } from "./plazos.service";
import { NotasController } from "./notas.controller";
import { NotasService } from "./notas.service";
import { GestionesModule } from "../gestiones/gestiones.module";
import { CoberturasModule } from "../coberturas/coberturas.module";

@Module({
  imports: [GestionesModule, CoberturasModule],
  controllers: [AtencionesController, DerivacionesController, NotasController],
  providers: [AtencionesService, DerivacionesService, PlazosService, NotasService],
  exports: [AtencionesService, PlazosService],
})
export class AtencionesModule {}
