import { Module } from "@nestjs/common";
import { MaestrosController } from "./maestros.controller";
import { MaestrosService } from "./maestros.service";
import { FeriadosController } from "./feriados.controller";
import { FeriadosService } from "./feriados.service";

@Module({
  controllers: [MaestrosController, FeriadosController],
  providers: [MaestrosService, FeriadosService],
  exports: [MaestrosService, FeriadosService],
})
export class MaestrosModule {}
