import { Module } from "@nestjs/common";
import { ArancelesModule } from "../aranceles/aranceles.module";
import { CoberturasController } from "./coberturas.controller";
import { CoberturasService } from "./coberturas.service";

@Module({
  imports: [ArancelesModule],
  controllers: [CoberturasController],
  providers: [CoberturasService],
  exports: [CoberturasService],
})
export class CoberturasModule {}
