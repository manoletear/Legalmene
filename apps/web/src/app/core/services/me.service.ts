import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import type { Permiso, UsuarioActual } from "@legalmene/shared";
import { environment } from "../../../environments/environment";

export type CurrentUser = UsuarioActual;

// Usuario autenticado con su perfil y permisos. Menú, botones y guards de ruta dependen de
// estos permisos (la API los vuelve a validar en cada endpoint).
@Injectable({ providedIn: "root" })
export class MeService {
  private http = inject(HttpClient);
  private _user = signal<CurrentUser | null>(null);
  private cargando: Promise<CurrentUser | null> | null = null;
  readonly user = this._user.asReadonly();
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
          return u;
        })
        .catch(() => {
          this._user.set(null);
          return null;
        })
        .finally(() => {
          this.cargando = null;
        });
    }
    return this.cargando;
  }
}
