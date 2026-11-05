import { HttpInterceptorFn } from "@angular/common/http";

// Adjunta el token de Entra ID a cada request al API (el plan ya no es tenant).
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem("entra_token");
  if (!token) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

// Headers para descargas hechas con fetch() fuera de HttpClient.
export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("entra_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
