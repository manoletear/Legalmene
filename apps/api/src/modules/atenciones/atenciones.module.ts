import { Module } from "@nestjs/common";
import { AtencionesController } from "./atenciones.controller";
import { AtencionesService } from "./atenciones.service";

@Module({
  controllers: [AtencionesController],
  providers: [AtencionesService],
  exports: [AtencionesService],
})
export class AtencionesModule {}
