import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { Afiliado, AfiliadoConPlanes, CreateAfiliado, PaginatedResult } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class AfiliadosApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/afiliados`;

  buscar(opts: {
    page?: number;
    pageSize?: number;
    q?: string;
    codPlan?: string;
  }): Observable<PaginatedResult<AfiliadoConPlanes>> {
    let params = new HttpParams();
    if (opts.page) params = params.set("page", opts.page);
    if (opts.pageSize) params = params.set("pageSize", opts.pageSize);
    if (opts.q) params = params.set("q", opts.q);
    if (opts.codPlan) params = params.set("codPlan", opts.codPlan);
    return this.http.get<PaginatedResult<AfiliadoConPlanes>>(this.base, { params });
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
