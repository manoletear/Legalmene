import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { Request } from "express";
import { AuditService } from "./audit.service";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";

const METHOD_TO_ACCION: Record<string, string> = {
  POST: "CREATE",
  PUT: "UPDATE",
  PATCH: "UPDATE",
  DELETE: "DELETE",
};

// Captura mutaciones y las graba en tabla auditoria.
// Entidad = primer segmento de la URL después de /api/v1/.
// EntidadId = id devuelto en response, o :id de URL si lo hay.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser; body?: Record<string, unknown> }
    >();
    const accion = METHOD_TO_ACCION[req.method];

    // Solo loguear mutaciones. Skip GET/HEAD/OPTIONS.
    if (!accion) return next.handle();

    // Skip endpoints sin auth contexto (callbacks WebPay, health).
    const url = req.originalUrl ?? req.url;
    if (url.includes("/pagos/confirmar") || url.includes("/health")) {
      return next.handle();
    }

    const segments = url.replace(/^\/api\/v1\//, "").split(/[/?]/);
    const entidad = segments[0] ?? "unknown";
    const urlIdParam = segments.find((s) => /^[0-9a-f-]{8,}/i.test(s)) ?? null;
    const user = req.user;
    const codPlanHeader = req.headers["x-cod-plan"];
    const codPlan = Array.isArray(codPlanHeader) ? codPlanHeader[0] : codPlanHeader ?? null;
    const ip = req.ip ?? req.socket?.remoteAddress ?? null;
    const userAgent = req.get("user-agent") ?? null;

    // Snapshot del body para "after"; omitir si es multipart o muy grande.
    const isMultipart = req.is("multipart/*");
    const beforeBody = isMultipart ? { __multipart: true } : req.body;

    return next.handle().pipe(
      tap((response) => {
        const responseObj = response as { id?: string } | null;
        const entidadId = responseObj?.id ?? urlIdParam ?? "unknown";
        void this.audit.log({
          actorId: user?.id ?? null,
          actorEmail: user?.email ?? null,
          accion,
          entidad,
          entidadId,
          codPlan,
          cambios: { after: response, requestBody: beforeBody } as {
            after: unknown;
            requestBody: unknown;
          },
          ip,
          userAgent,
        });
      }),
    );
  }
}
