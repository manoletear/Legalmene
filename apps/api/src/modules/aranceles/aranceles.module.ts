import { Module } from "@nestjs/common";
import { ArancelesController } from "./aranceles.controller";
import { ArancelesService } from "./aranceles.service";

@Module({
  controllers: [ArancelesController],
  providers: [ArancelesService],
  exports: [ArancelesService],
})
export class ArancelesModule {}
