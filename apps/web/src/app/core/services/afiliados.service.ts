import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { Afiliado, CreateAfiliado, PaginatedResult } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class AfiliadosApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/afiliados`;

  buscar(opts: { page?: number; pageSize?: number; q?: string }): Observable<PaginatedResult<Afiliado>> {
    let params = new HttpParams();
    if (opts.page) params = params.set("page", opts.page);
    if (opts.pageSize) params = params.set("pageSize", opts.pageSize);
    if (opts.q) params = params.set("q", opts.q);
    return this.http.get<PaginatedResult<Afiliado>>(this.base, { params });
  }

  crear(payload: CreateAfiliado): Observable<Afiliado> {
    return this.http.post<Afiliado>(this.base, payload);
  }
}
