import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { Afiliado, AfiliadoConPlanes, BienAfiliado, CargaAfiliado, CreateAfiliado, PaginatedResult } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class AfiliadosApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/afiliados`;

  buscar(opts: {
    page?: number;
    pageSize?: number;
    q?: string;
    codPlan?: string;
    canalId?: string;
    rut?: string;
    vigencia?: string;
  }): Observable<PaginatedResult<AfiliadoConPlanes>> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResult<AfiliadoConPlanes>>(this.base, { params });
  }

  cargas(id: string): Observable<CargaAfiliado[]> {
    return this.http.get<CargaAfiliado[]>(`${this.base}/${id}/cargas`);
  }

  bienes(id: string): Observable<BienAfiliado[]> {
    return this.http.get<BienAfiliado[]>(`${this.base}/${id}/bienes`);
  }

  obtener(id: string): Observable<AfiliadoConPlanes> {
    return this.http.get<AfiliadoConPlanes>(`${this.base}/${id}`);
  }

  porRut(rut: string): Observable<AfiliadoConPlanes> {
    return this.http.get<AfiliadoConPlanes>(`${this.base}/rut/${encodeURIComponent(rut)}`);
  }

  crear(payload: CreateAfiliado): Observable<Afiliado> {
    return this.http.post<Afiliado>(this.base, payload);
  }
}
