import { Module } from "@nestjs/common";
import { CamposAdicionalesController } from "./campos-adicionales.controller";
import { CamposAdicionalesService } from "./campos-adicionales.service";

@Module({
  controllers: [CamposAdicionalesController],
  providers: [CamposAdicionalesService],
  exports: [CamposAdicionalesService],
})
export class CamposAdicionalesModule {}
