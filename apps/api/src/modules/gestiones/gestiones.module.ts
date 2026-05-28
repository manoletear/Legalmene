import { Module } from "@nestjs/common";
import { GestionesController } from "./gestiones.controller";
import { GestionesService } from "./gestiones.service";

@Module({
  controllers: [GestionesController],
  providers: [GestionesService],
})
export class GestionesModule {}
