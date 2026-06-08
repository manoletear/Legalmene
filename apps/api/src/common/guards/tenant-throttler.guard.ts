import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";

// Rate limit per-tenant cuando el header X-Cod-Plan está presente; caída a IP
// para anónimos. Evita que un solo cliente abusivo dispare el bucket global
// del tenant DEMO y degrade a otros.
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    const codPlan = r.headers?.["x-cod-plan"];
    const tenant = Array.isArray(codPlan) ? codPlan[0] : codPlan;
    if (tenant) return `tenant:${tenant}`;
    // Fallback IP (ALB pone client real en X-Forwarded-For).
    const xff = r.headers?.["x-forwarded-for"];
    const ip = Array.isArray(xff) ? xff[0] : (xff as string | undefined);
    return ip?.split(",")[0]?.trim() ?? r.ip ?? "anon";
  }

  // Mensaje de error en español (default es "ThrottlerException: Too Many Requests").
  protected async throwThrottlingException(_context: ExecutionContext): Promise<void> {
    const { ThrottlerException } = await import("@nestjs/throttler");
    throw new ThrottlerException("Demasiadas solicitudes. Reintentar en breve.");
  }
}
