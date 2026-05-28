import { Module } from "@nestjs/common";
import { AfiliadosController } from "./afiliados.controller";
import { AfiliadosService } from "./afiliados.service";

@Module({
  controllers: [AfiliadosController],
  providers: [AfiliadosService],
  exports: [AfiliadosService],
})
export class AfiliadosModule {}
