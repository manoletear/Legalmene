import { Module } from "@nestjs/common";
import { ArancelesModule } from "../aranceles/aranceles.module";
import { CoberturasController } from "./coberturas.controller";
import { CoberturasService } from "./coberturas.service";
import { ArancelesAtencionController } from "./aranceles-atencion.controller";
import { ArancelesAtencionService } from "./aranceles-atencion.service";

@Module({
  imports: [ArancelesModule],
  controllers: [CoberturasController, ArancelesAtencionController],
  providers: [CoberturasService, ArancelesAtencionService],
  exports: [CoberturasService, ArancelesAtencionService],
})
export class CoberturasModule {}
