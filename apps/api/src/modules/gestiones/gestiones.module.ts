import { Module } from "@nestjs/common";
import { GestionesController } from "./gestiones.controller";
import { GestionesService } from "./gestiones.service";
import { PlantillasController } from "./plantillas.controller";
import { PlantillasService } from "./plantillas.service";

@Module({
  controllers: [GestionesController, PlantillasController],
  providers: [GestionesService, PlantillasService],
  exports: [PlantillasService],
})
export class GestionesModule {}
