import { Module } from "@nestjs/common";
import { CoberturasModule } from "../coberturas/coberturas.module";
import { PagosController } from "./pagos.controller";
import { PagosService } from "./pagos.service";

@Module({
  imports: [CoberturasModule],
  controllers: [PagosController],
  providers: [PagosService],
})
export class PagosModule {}
