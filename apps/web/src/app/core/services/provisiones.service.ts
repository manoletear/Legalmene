import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type {
  EstadoProvision,
  MovimientoProvision,
  Provision,
  RegistrarMovimiento,
  ResumenProvisionAtencion,
  SolicitarProvision,
} from "@legalmene/shared";

export interface ProvisionRow {
  id: string;
  atencionId: string;
  correlativo: string;
  asunto: string;
  monto: number;
  motivo: string;
  estado: EstadoProvision;
  solicitadaPorEmail: string;
  fechaSolicitud: string;
  fechaResolucion: string | null;
  observacionResolucion: string | null;
}

export interface ProvisionesPage {
  data: ProvisionRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ProvisionesAtencion {
  data: Provision[];
  resumen: ResumenProvisionAtencion;
}

@Injectable({ providedIn: "root" })
export class ProvisionesApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listar(opts: { page?: number; pageSize?: number; estado?: string }): Observable<ProvisionesPage> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<ProvisionesPage>(`${this.base}/provisiones`, { params });
  }

  porAtencion(atencionId: string): Observable<ProvisionesAtencion> {
    return this.http.get<ProvisionesAtencion>(`${this.base}/atenciones/${atencionId}/provisiones`);
  }

  solicitar(atencionId: string, payload: SolicitarProvision): Observable<Provision> {
    return this.http.post<Provision>(`${this.base}/atenciones/${atencionId}/provisiones`, payload);
  }

  aprobar(id: string, observacion?: string): Observable<Provision> {
    return this.http.put<Provision>(`${this.base}/provisiones/${id}/aprobar`, { observacion });
  }

  rechazar(id: string, observacion?: string): Observable<Provision> {
    return this.http.put<Provision>(`${this.base}/provisiones/${id}/rechazar`, { observacion });
  }

  movimientos(id: string): Observable<MovimientoProvision[]> {
    return this.http.get<MovimientoProvision[]>(`${this.base}/provisiones/${id}/movimientos`);
  }

  registrarMovimiento(id: string, payload: RegistrarMovimiento): Observable<MovimientoProvision> {
    return this.http.post<MovimientoProvision>(`${this.base}/provisiones/${id}/movimientos`, payload);
  }
}
