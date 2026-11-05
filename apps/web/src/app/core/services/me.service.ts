import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import type { Permiso, UsuarioActual } from "@legalmene/shared";
import { environment } from "../../../environments/environment";

export type CurrentUser = UsuarioActual;

export interface ErrorSesion {
  tipo: "sin_conexion" | "sin_acceso";
  mensaje: string;
}

// Usuario autenticado con su perfil y permisos. Menú, botones y guards de ruta dependen de
// estos permisos (la API los vuelve a validar en cada endpoint).
@Injectable({ providedIn: "root" })
export class MeService {
  private http = inject(HttpClient);
  private _user = signal<CurrentUser | null>(null);
  private cargando: Promise<CurrentUser | null> | null = null;
  private _error = signal<ErrorSesion | null>(null);
  readonly user = this._user.asReadonly();
  readonly error = this._error.asReadonly();
  readonly permisos = computed(() => new Set<string>(this._user()?.permisos ?? []));

  tiene(p: Permiso): boolean {
    return this.permisos().has(p);
  }

  algunoDe(ps: readonly Permiso[]): boolean {
    return ps.some((p) => this.permisos().has(p));
  }

  load(): void {
    void this.asegurar();
  }

  // Espera la carga de /me (la usan los guards de ruta).
  asegurar(): Promise<CurrentUser | null> {
    if (this._user()) return Promise.resolve(this._user());
    if (!this.cargando) {
      this.cargando = firstValueFrom(this.http.get<CurrentUser>(`${environment.apiBaseUrl}/me`))
        .then((u) => {
          this._user.set(u);
          this._error.set(null);
          return u;
        })
        .catch((err: unknown) => {
          this._user.set(null);
          this._error.set(describirError(err));
          return null;
        })
        .finally(() => {
          this.cargando = null;
        });
    }
    return this.cargando;
  }
}

function describirError(err: unknown): ErrorSesion {
  const http = err instanceof HttpErrorResponse ? err : null;
  if (http && (http.status === 401 || http.status === 403)) {
    const mensaje = typeof http.error?.message === "string" ? http.error.message : "Su usuario no tiene acceso a la plataforma.";
    return { tipo: "sin_acceso", mensaje };
  }
  return {
    tipo: "sin_conexion",
    mensaje: "El servidor no respondió. Si recién se despertó, puede tardar hasta un minuto en iniciar: reintente en unos segundos.",
  };
}
