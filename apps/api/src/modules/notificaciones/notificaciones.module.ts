import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { NotificacionesService } from "./notificaciones.service";
import { VencimientosScheduler } from "./vencimientos.scheduler";
import { SesProvider } from "./ses.provider";

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [NotificacionesService, VencimientosScheduler, SesProvider],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
