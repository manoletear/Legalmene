import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { IniciarPago, Pago, PaginatedResult } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class PagosApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/pagos`;

  listar(opts: { page?: number; pageSize?: number; estado?: string }): Observable<PaginatedResult<Pago>> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResult<Pago>>(this.base, { params });
  }

  iniciar(payload: IniciarPago): Observable<{ pago: Pago; redirectUrl: string }> {
    return this.http.post<{ pago: Pago; redirectUrl: string }>(`${this.base}/iniciar`, payload);
  }
}
