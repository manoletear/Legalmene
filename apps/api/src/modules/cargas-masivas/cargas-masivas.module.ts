import { Module } from "@nestjs/common";
import { CargasMasivasController } from "./cargas-masivas.controller";
import { CargasMasivasService } from "./cargas-masivas.service";
import { AtencionesModule } from "../atenciones/atenciones.module";

@Module({
  imports: [AtencionesModule],
  controllers: [CargasMasivasController],
  providers: [CargasMasivasService],
})
export class CargasMasivasModule {}
