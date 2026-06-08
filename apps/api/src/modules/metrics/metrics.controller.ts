import { Controller, Get, Header, Res } from "@nestjs/common";
import { Response } from "express";
import { ApiExcludeController } from "@nestjs/swagger";
import { MetricsService } from "./metrics.service";

// /metrics expuesto sin auth porque debe ser scrapeable por Prometheus.
// En producción se restringe por security group o se mueve a un puerto interno.
@ApiExcludeController()
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async metricsExport(@Res() res: Response) {
    res.send(await this.metrics.registry.metrics());
  }
}
