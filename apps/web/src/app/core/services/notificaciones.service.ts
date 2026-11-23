import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface NotifItem {
  id: string;
  severidad: "info" | "warn" | "critical";
  titulo: string;
  detalle?: string;
}

export interface NotifResp {
  count: number;
  items: NotifItem[];
}

@Injectable({ providedIn: "root" })
export class NotificacionesApiService {
  private http = inject(HttpClient);

  obtener(): Observable<NotifResp> {
    return this.http.get<NotifResp>(`${environment.apiBaseUrl}/dashboard/notificaciones`);
  }
}
