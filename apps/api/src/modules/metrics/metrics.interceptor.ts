import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { Request, Response } from "express";
import { MetricsService } from "./metrics.service";

// Captura cada request HTTP: cuenta + mide latencia, etiquetando con
// método, route, status y codPlan (cuando el tenant header está presente).
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = process.hrtime.bigint();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => this.record(req, res, start),
        error: () => this.record(req, res, start),
      }),
    );
  }

  private record(req: Request, res: Response, start: bigint) {
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    // route puede no estar disponible en todos los handlers; usar path crudo.
    const route =
      (req.route as { path?: string } | undefined)?.path ??
      req.baseUrl + (req.url?.split("?")[0] ?? "");
    const method = req.method;
    const status = String(res.statusCode);
    const codPlanHeader = req.headers["x-cod-plan"];
    const codPlan = Array.isArray(codPlanHeader) ? codPlanHeader[0] : codPlanHeader ?? "none";

    this.metrics.httpRequestsTotal.labels(method, route, status, codPlan).inc();
    this.metrics.httpRequestDurationMs.labels(method, route, status).observe(ms);
  }
}
