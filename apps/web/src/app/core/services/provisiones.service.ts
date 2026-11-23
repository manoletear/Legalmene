import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type {
  EstadoProvision,
  EventoFinanciero,
  MedioPago,
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
  montoEntregado: number | null;
  fechaDisponible: string | null;
  numeroCheque: string | null;
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

  listar(opts: Record<string, string | number | undefined>): Observable<ProvisionesPage> {
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

  private accion(id: string, accion: string, body: object = {}): Observable<Provision> {
    return this.http.post<Provision>(`${this.base}/provisiones/${id}/${accion}`, body);
  }

  pagoCliente(id: string, medio: MedioPago) {
    return this.accion(id, "pago-cliente", { medio });
  }
  solicitarEntrega(id: string) {
    return this.accion(id, "solicitar-entrega");
  }
  autorizar(id: string, observacion?: string) {
    return this.accion(id, "autorizar", { observacion });
  }
  rechazarEntrega(id: string, observacion: string) {
    return this.accion(id, "rechazar-entrega", { observacion });
  }
  disponible(id: string) {
    return this.accion(id, "disponible");
  }
  entregar(id: string, montoEntregado?: number) {
    return this.accion(id, "entregar", { montoEntregado });
  }
  rendir(id: string) {
    return this.accion(id, "rendir");
  }
  devolucion(id: string, numeroCheque: string) {
    return this.accion(id, "devolucion", { numeroCheque });
  }

  eventos(id: string): Observable<EventoFinanciero[]> {
    return this.http.get<EventoFinanciero[]>(`${this.base}/provisiones/${id}/eventos`);
  }

  movimientos(id: string): Observable<MovimientoProvision[]> {
    return this.http.get<MovimientoProvision[]>(`${this.base}/provisiones/${id}/movimientos`);
  }

  registrarMovimiento(id: string, payload: RegistrarMovimiento): Observable<MovimientoProvision> {
    return this.http.post<MovimientoProvision>(`${this.base}/provisiones/${id}/movimientos`, payload);
  }
}
