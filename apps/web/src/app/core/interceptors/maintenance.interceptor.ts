import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MaintenanceService } from "../services/maintenance.service";

// Intercepta 503 (mantenimiento) y muestra banner global + snackbar.
// Si el backend emite Retry-After, el banner queda hasta que pase ese tiempo.
export const maintenanceInterceptor: HttpInterceptorFn = (req, next) => {
  const snack = inject(MatSnackBar);
  const maint = inject(MaintenanceService);
  return next(req).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse && err.status === 503) {
        const retry = Number(err.headers?.get("Retry-After")) || 300;
        maint.activate(retry);
        snack.open(
          err.error?.message ?? "Sistema en mantenimiento. Reintentar más tarde.",
          "Cerrar",
          { duration: 6000 },
        );
      }
      return throwError(() => err);
    }),
  );
};
