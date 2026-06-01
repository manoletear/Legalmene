import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable } from "rxjs";
import type { Request } from "express";

// Modo mantenimiento: cuando MAINTENANCE_MODE=true se rechazan las mutaciones
// (POST/PUT/PATCH/DELETE) con 503 + Retry-After. Lecturas (GET/HEAD) pasan.
// Útil para freezes de despliegue o ventanas de migración mientras la DB
// está temporalmente inconsistente.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class MaintenanceInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Lee process.env en vez de ConfigService para captar flips en caliente
    // (toggle vía AWS SSM Parameter Store + restart no requerido en futuro).
    const enabled =
      (process.env.MAINTENANCE_MODE ?? this.config.get<string>("MAINTENANCE_MODE")) === "true";
    if (!enabled) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return next.handle();

    // Excepciones críticas que sí dejamos pasar (callback de pago, health).
    const url = req.originalUrl ?? req.url ?? "";
    if (url.includes("/pagos/confirmar")) return next.handle();

    const retryAfterSec = Number(this.config.get<string>("MAINTENANCE_RETRY_AFTER") ?? "300");
    const res = ctx.switchToHttp().getResponse<{ setHeader: (n: string, v: string) => void }>();
    res.setHeader("Retry-After", String(retryAfterSec));

    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "Service Unavailable",
        message: "Sistema en mantenimiento. Reintentar más tarde.",
        retryAfterSec,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
