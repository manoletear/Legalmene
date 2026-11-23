import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { Request, Response } from "express";
import { MetricsService } from "./metrics.service";

// Captura cada request HTTP: cuenta + mide latencia, etiquetando con método, patrón de
// ruta y status. Ninguna etiqueta viene del request (cabeceras, URL cruda): cada valor
// distinto crea una serie permanente en memoria.
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
    const route = (req.route as { path?: string } | undefined)?.path ?? "sin_ruta";
    const method = req.method;
    const status = String(res.statusCode);

    this.metrics.httpRequestsTotal.labels(method, route, status).inc();
    this.metrics.httpRequestDurationMs.labels(method, route, status).observe(ms);
  }
}
