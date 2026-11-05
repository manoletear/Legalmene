import { Module } from "@nestjs/common";
import { ProvisionesController } from "./provisiones.controller";
import { ProvisionesService } from "./provisiones.service";
import { ProvisionesScheduler } from "./provisiones.scheduler";

@Module({
  controllers: [ProvisionesController],
  providers: [ProvisionesService, ProvisionesScheduler],
  exports: [ProvisionesService],
})
export class ProvisionesModule {}
