import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";

// Rate limit por IP del cliente. req.ip respeta app.set("trust proxy", N) (main.ts), que
// toma la IP agregada por el proxy de confianza. Nunca se usan cabeceras que elige el
// cliente (X-Cod-Plan, primera entrada de X-Forwarded-For): permitirían saltarse el
// límite o agotar el cupo de otra IP.
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    return r.ip ?? r.socket?.remoteAddress ?? "anon";
  }

  // Mensaje de error en español (default es "ThrottlerException: Too Many Requests").
  protected async throwThrottlingException(_context: ExecutionContext): Promise<void> {
    const { ThrottlerException } = await import("@nestjs/throttler");
    throw new ThrottlerException("Demasiadas solicitudes. Reintentar en breve.");
  }
}
