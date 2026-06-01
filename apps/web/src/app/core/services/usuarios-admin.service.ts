import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface UsuarioAdmin {
  id: string;
  entraOid: string;
  email: string;
  nombre: string;
  rol: "Administrador" | "Supervisor" | "Abogado" | "Operador" | "Auditor";
  codPlanes: string[];
  activo: boolean;
  ultimoLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsuariosPage {
  data: UsuarioAdmin[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable({ providedIn: "root" })
export class UsuariosAdminService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/admin/usuarios`;

  listar(opts: { page?: number; pageSize?: number; q?: string; rol?: string; activo?: boolean }): Observable<UsuariosPage> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<UsuariosPage>(this.base, { params });
  }

  actualizar(
    id: string,
    patch: { rol?: string; activo?: boolean; codPlanes?: string[] },
  ): Observable<UsuarioAdmin> {
    return this.http.patch<UsuarioAdmin>(`${this.base}/${id}`, patch);
  }
}
