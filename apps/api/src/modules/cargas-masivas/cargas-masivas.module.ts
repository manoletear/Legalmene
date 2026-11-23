import { Module } from "@nestjs/common";
import { CargasMasivasController } from "./cargas-masivas.controller";
import { CargasMasivasService } from "./cargas-masivas.service";

@Module({
  controllers: [CargasMasivasController],
  providers: [CargasMasivasService],
})
export class CargasMasivasModule {}
