import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ProvisionesService } from "./provisiones.service";

@Injectable()
export class ProvisionesScheduler {
  private readonly logger = new Logger(ProvisionesScheduler.name);

  constructor(@Inject(ProvisionesService) private readonly service: ProvisionesService) {}

  // Días hábiles a las 09:00 de Chile (12:00 UTC): fondos disponibles no retirados vuelven a Pagada.
  @Cron("0 12 * * 1-5")
  async revisarDisponibles(): Promise<void> {
    const n = await this.service.revertirDisponiblesVencidas();
    if (n > 0) this.logger.log(`${n} provisión(es) disponibles no retiradas volvieron a Pagada`);
  }
}
