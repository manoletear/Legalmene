import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface AuditRow {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  accion: string;
  entidad: string;
  entidadId: string;
  codPlan: string | null;
  cambios: { before?: unknown; after?: unknown; requestBody?: unknown } | null;
  ip: string | null;
  userAgent: string | null;
  timestamp: string;
}

export interface AuditPage {
  data: AuditRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable({ providedIn: "root" })
export class AuditApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/auditoria`;

  listar(opts: {
    page?: number;
    pageSize?: number;
    entidad?: string;
    entidadId?: string;
    actorId?: string;
  }): Observable<AuditPage> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<AuditPage>(this.base, { params });
  }
}
