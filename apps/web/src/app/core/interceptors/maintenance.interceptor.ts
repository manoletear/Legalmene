import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { MessageService } from "primeng/api";
import { MaintenanceService } from "../services/maintenance.service";

// 503 mantenimiento: activa banner global y emite toast.
// Retry-After del backend define cuánto tiempo permanece visible.
export const maintenanceInterceptor: HttpInterceptorFn = (req, next) => {
  const msg = inject(MessageService);
  const maint = inject(MaintenanceService);
  return next(req).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse && err.status === 503) {
        const retry = Number(err.headers?.get("Retry-After")) || 300;
        maint.activate(retry);
        msg.add({
          severity: "warn",
          summary: "Mantenimiento",
          detail: err.error?.message ?? "Sistema en mantenimiento. Reintentar más tarde.",
          life: 6000,
        });
      }
      return throwError(() => err);
    }),
  );
};
