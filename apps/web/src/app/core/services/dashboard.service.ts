import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface DashboardKpis {
  codPlan: string;
  afiliados: { total: number; activos: number; eliminados: number };
  atenciones: {
    total: number;
    abiertas: number;
    enGestion: number;
    enComite: number;
    cerradas: number;
    porTipo: { Consulta: number; Asesoria: number; Juicio: number };
    creadasHoy: number;
    creadasUltimos30Dias: number;
  };
  gestiones: { pendientes: number; vencidas: number };
  comites: { abiertos: number };
}

export interface TimelinePoint {
  fecha: string;
  total: number;
}

@Injectable({ providedIn: "root" })
export class DashboardApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/dashboard`;

  kpis(): Observable<DashboardKpis> {
    return this.http.get<DashboardKpis>(`${this.base}/kpis`);
  }

  timeline(dias = 30): Observable<TimelinePoint[]> {
    return this.http.get<TimelinePoint[]>(`${this.base}/timeline-atenciones`, {
      params: new HttpParams().set("dias", String(dias)),
    });
  }
}
