import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface NotifItem {
  id: string;
  codPlan: string;
  usuarioId: string;
  severidad: "info" | "warn" | "critical";
  titulo: string;
  detalle: string | null;
  accionUrl: string | null;
  metadata: Record<string, unknown> | null;
  seen: boolean;
  seenAt: string | null;
  createdAt: string;
}

export interface InboxPage {
  data: NotifItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unseen: number;
}

@Injectable({ providedIn: "root" })
export class NotifInboxApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/notif-inbox`;

  inbox(opts: { page?: number; pageSize?: number; soloUnseen?: boolean }): Observable<InboxPage> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== false) params = params.set(k, String(v));
    });
    return this.http.get<InboxPage>(this.base, { params });
  }

  marcarLeida(id: string): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/seen`, {});
  }

  marcarTodasLeidas(): Observable<{ marcadas: number }> {
    return this.http.post<{ marcadas: number }>(`${this.base}/seen-all`, {});
  }
}
