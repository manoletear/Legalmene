import { Module } from "@nestjs/common";
import { ProvisionesController } from "./provisiones.controller";
import { ProvisionesService } from "./provisiones.service";

@Module({
  controllers: [ProvisionesController],
  providers: [ProvisionesService],
  exports: [ProvisionesService],
})
export class ProvisionesModule {}
