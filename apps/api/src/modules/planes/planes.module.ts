import { Module } from "@nestjs/common";
import { PlanesController } from "./planes.controller";
import { PlanesService } from "./planes.service";

@Module({
  controllers: [PlanesController],
  providers: [PlanesService],
  exports: [PlanesService],
})
export class PlanesModule {}
