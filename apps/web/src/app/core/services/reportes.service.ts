import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { FilaController, FilaReporteCanal, FilaReportePlan, SerieAfiliadosMes } from "@legalmene/shared";

export type ParamsReporte = Record<string, string | undefined>;

function params(p: ParamsReporte): HttpParams {
  let h = new HttpParams();
  for (const [k, v] of Object.entries(p)) if (v) h = h.set(k, v);
  return h;
}

@Injectable({ providedIn: "root" })
export class ReportesApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/reportes`;

  porPlan(p: ParamsReporte): Observable<FilaReportePlan[]> {
    return this.http.get<FilaReportePlan[]>(`${this.base}/plan`, { params: params(p) });
  }

  porCanal(p: ParamsReporte): Observable<FilaReporteCanal[]> {
    return this.http.get<FilaReporteCanal[]>(`${this.base}/canal`, { params: params(p) });
  }

  afiliadosMes(p: ParamsReporte): Observable<SerieAfiliadosMes[]> {
    return this.http.get<SerieAfiliadosMes[]>(`${this.base}/afiliados-mes`, { params: params(p) });
  }

  controller(p: ParamsReporte): Observable<FilaController[]> {
    return this.http.get<FilaController[]>(`${this.base}/controller`, { params: params(p) });
  }
}
