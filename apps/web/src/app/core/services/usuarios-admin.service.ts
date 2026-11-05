import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import type { CreatePerfil, Perfil, UpdatePerfil, UpdateUsuarioAdmin, UsuarioAdmin } from "@legalmene/shared";
import { environment } from "../../../environments/environment";

export type { UsuarioAdmin };

export interface UsuariosPage {
  data: UsuarioAdmin[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UsuarioOpcion {
  id: string;
  nombre: string;
  email: string;
  perfilCodigo: string;
}

@Injectable({ providedIn: "root" })
export class UsuariosAdminService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/admin/usuarios`;

  listar(opts: { page?: number; pageSize?: number; q?: string; perfilId?: string; activo?: boolean }): Observable<UsuariosPage> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<UsuariosPage>(this.base, { params });
  }

  actualizar(id: string, patch: UpdateUsuarioAdmin): Observable<UsuarioAdmin> {
    return this.http.patch<UsuarioAdmin>(`${this.base}/${id}`, patch);
  }

  bloquear(id: string, bloqueado: boolean, motivo?: string): Observable<UsuarioAdmin> {
    return this.http.put<UsuarioAdmin>(`${this.base}/${id}/bloqueo`, { bloqueado, motivo });
  }

  opciones(): Observable<UsuarioOpcion[]> {
    return this.http.get<UsuarioOpcion[]>(`${environment.apiBaseUrl}/usuarios/opciones`);
  }
}

@Injectable({ providedIn: "root" })
export class PerfilesApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/admin/perfiles`;

  listar(): Observable<Perfil[]> {
    return this.http.get<Perfil[]>(this.base);
  }

  crear(payload: CreatePerfil): Observable<Perfil> {
    return this.http.post<Perfil>(this.base, payload);
  }

  actualizar(id: string, patch: UpdatePerfil): Observable<Perfil> {
    return this.http.patch<Perfil>(`${this.base}/${id}`, patch);
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
