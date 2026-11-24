import { Global, Module } from "@nestjs/common";
import { NotificacionesModule } from "../notificaciones/notificaciones.module";
import { CorreosService } from "./correos.service";
import { CorreosController } from "./correos.controller";

@Global()
@Module({
  imports: [NotificacionesModule],
  controllers: [CorreosController],
  providers: [CorreosService],
  exports: [CorreosService],
})
export class CorreosModule {}
