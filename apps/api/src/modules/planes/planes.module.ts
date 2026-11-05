import { Module } from "@nestjs/common";
import { PlanesController } from "./planes.controller";
import { PlanesService } from "./planes.service";
import { CanalesController } from "./canales.controller";

@Module({
  controllers: [PlanesController, CanalesController],
  providers: [PlanesService],
  exports: [PlanesService],
})
export class PlanesModule {}
