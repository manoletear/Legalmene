import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { Router } from "@angular/router";
import { catchError, throwError } from "rxjs";
import { tokenSesion } from "../services/sesion.service";

function tokenActual(): string | null {
  try {
    return tokenSesion() ?? localStorage.getItem("entra_token");
  } catch {
    return null;
  }
}

// Adjunta la sesión (enlace de acceso) o el token de Entra ID a cada request al API.
// Un 401 fuera del login significa sesión ausente o vencida: se vuelve a la pantalla de ingreso.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = tokenActual();
  const conToken = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(conToken).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.includes("/auth/") && !router.url.startsWith("/login")) {
        void router.navigate(["/login"]);
      }
      return throwError(() => err);
    }),
  );
};

// Headers para descargas hechas con fetch() fuera de HttpClient.
export function authHeaders(): Record<string, string> {
  const token = tokenActual();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
