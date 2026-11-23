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

// Campos que nunca se guardan en la auditoría (credenciales y secretos).
const CLAVES_SENSIBLES = new Set(["token", "secret", "password", "enlacedemo", "headers", "authorization", "sig"]);

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 20) return "[...]";
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        CLAVES_SENSIBLES.has(k.toLowerCase()) ? "[REDACTADO]" : redactar(v, profundidad + 1),
      ]),
    );
  }
  return valor;
}

// Rutas que no se auditan: login (sus respuestas son credenciales; el ingreso se audita
// aparte en EnlacesAccesoService) y health. Se comparan por ruta exacta, sin query string.
// La confirmación manual de pagos sí se audita.
export function rutaSinAuditoria(path: string): boolean {
  return path.startsWith("/api/v1/auth/") || path === "/api/v1/health" || path.startsWith("/api/v1/health/");
}

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

    // Ruta sin query string: un parámetro inventado no puede activar una exención.
    const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
    if (rutaSinAuditoria(path)) return next.handle();

    const segments = path.replace(/^\/api\/v1\//, "").split("/");
    const entidad = segments[0] ?? "unknown";
    const urlIdParam = segments.find((s) => /^[0-9a-f-]{8,}/i.test(s)) ?? null;
    const user = req.user;
    const codPlan = null;
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
          cambios: { after: redactar(response), requestBody: redactar(beforeBody) } as {
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
