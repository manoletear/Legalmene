import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";

export interface WebhookSus {
  id: string;
  codPlan: string;
  nombre: string;
  url: string;
  eventos: string[];
  secret: string;
  activo: boolean;
  headers: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEntrega {
  id: string;
  suscripcionId: string;
  evento: string;
  estado: "Pendiente" | "Enviada" | "Fallida" | "Reintentar";
  intentos: number;
  httpStatus: number | null;
  respuesta: string | null;
  ultimoError: string | null;
  proximoReintento: string | null;
  createdAt: string;
}

export interface EntregasPage {
  data: WebhookEntrega[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const WEBHOOK_EVENTOS = [
  "atencion.creada",
  "atencion.derivada",
  "atencion.cerrada",
  "gestion.creada",
  "gestion.completada",
  "comite.convocado",
  "comite.cerrado",
  "pago.autorizado",
  "pago.rechazado",
  "afiliado.eliminado",
];

@Injectable({ providedIn: "root" })
export class WebhooksApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/webhooks`;

  listar(): Observable<WebhookSus[]> {
    return this.http.get<WebhookSus[]>(this.base);
  }

  crear(body: { nombre: string; url: string; eventos: string[]; headers?: Record<string, string> }): Observable<WebhookSus> {
    return this.http.post<WebhookSus>(this.base, body);
  }

  actualizar(id: string, patch: Partial<WebhookSus>): Observable<WebhookSus> {
    return this.http.patch<WebhookSus>(`${this.base}/${id}`, patch);
  }

  eliminar(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  entregas(opts: { page?: number; pageSize?: number; estado?: string }): Observable<EntregasPage> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<EntregasPage>(`${this.base}/entregas`, { params });
  }

  reintentar(id: string): Observable<WebhookEntrega> {
    return this.http.post<WebhookEntrega>(`${this.base}/entregas/${id}/reintentar`, {});
  }
}
