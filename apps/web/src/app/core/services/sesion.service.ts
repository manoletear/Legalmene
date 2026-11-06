import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, catchError, finalize, map, of, tap } from "rxjs";
import type { SesionIniciada, SolicitudEnlaceResultado } from "@legalmene/shared";
import { environment } from "../../../environments/environment";

const CLAVE_SESION = "lm.sesion";

// Token de sesión del login con enlace de acceso. Si vence, la API responde 401 y el
// interceptor lleva al login.
export function tokenSesion(): string | null {
  try {
    const raw = localStorage.getItem(CLAVE_SESION);
    if (!raw) return null;
    const s = JSON.parse(raw) as SesionIniciada;
    if (new Date(s.expiraEn).getTime() <= Date.now()) {
      localStorage.removeItem(CLAVE_SESION);
      return null;
    }
    return s.token;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: "root" })
export class SesionService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/auth`;

  get activa(): boolean {
    return !!tokenSesion();
  }

  solicitarEnlace(email: string): Observable<SolicitudEnlaceResultado> {
    return this.http.post<SolicitudEnlaceResultado>(`${this.base}/enlace`, { email });
  }

  verificar(token: string): Observable<SesionIniciada> {
    return this.http.post<SesionIniciada>(`${this.base}/enlace/verificar`, { token }).pipe(
      tap((s) => {
        try {
          localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
        } catch {
          // Sin almacenamiento local la sesión dura solo hasta recargar.
        }
      }),
    );
  }

  // Cierra la sesión en el servidor (invalida el token aunque alguien lo haya copiado) y
  // luego borra la copia local, aunque la llamada falle.
  cerrarEnServidor(): Observable<void> {
    if (!this.activa) {
      this.cerrar();
      return of(undefined);
    }
    return this.http.post<void>(`${this.base}/logout`, {}).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      finalize(() => this.cerrar()),
    );
  }

  cerrar(): void {
    try {
      localStorage.removeItem(CLAVE_SESION);
      localStorage.removeItem("entra_token");
    } catch {
      // Nada que limpiar.
    }
  }
}
