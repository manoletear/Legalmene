import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type {
  AprobarDerivacion,
  Atencion,
  AtencionConMaestros,
  CambiarEstado,
  Contraparte,
  CopagoResultado,
  CreateAtencion,
  CreateContraparte,
  DerivacionRow,
  NuevoCorrelativo,
  PaginatedResult,
  SolicitarDerivacion,
  UpdateAtencion,
  UpdateContraparte,
} from "@legalmene/shared";

export interface BuscarAtencionesOpts {
  page?: number;
  pageSize?: number;
  tipo?: "Consulta" | "Asesoria" | "Juicio";
  estado?: string;
  correlativo?: string;
  afiliadoId?: string;
  codPlan?: string;
  competenciaId?: string;
  materiaId?: string;
  q?: string;
}

@Injectable({ providedIn: "root" })
export class AtencionesApiService {
  private http = inject(HttpClient);
  private api = environment.apiBaseUrl;
  private base = `${environment.apiBaseUrl}/atenciones`;

  buscar(opts: BuscarAtencionesOpts): Observable<PaginatedResult<AtencionConMaestros>> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResult<AtencionConMaestros>>(this.base, { params });
  }

  obtener(id: string): Observable<AtencionConMaestros> {
    return this.http.get<AtencionConMaestros>(`${this.base}/${id}`);
  }

  copago(id: string): Observable<CopagoResultado & { codPlan: string }> {
    return this.http.get<CopagoResultado & { codPlan: string }>(`${this.base}/${id}/copago`);
  }

  actualizar(id: string, patch: UpdateAtencion): Observable<Atencion> {
    return this.http.patch<Atencion>(`${this.base}/${id}`, patch);
  }

  cambiarEstado(id: string, payload: CambiarEstado): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/${id}/estado`, payload);
  }

  nuevoCorrelativo(id: string, payload: NuevoCorrelativo): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/${id}/nuevo-correlativo`, payload);
  }

  crearConsulta(payload: Omit<CreateAtencion, "tipo">): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/consultas`, payload);
  }

  crearAsesoria(payload: Omit<CreateAtencion, "tipo">): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/asesorias`, payload);
  }

  crearJuicio(payload: Omit<CreateAtencion, "tipo">): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/juicios`, payload);
  }

  // --- Derivaciones ---
  solicitarDerivacion(id: string, payload: SolicitarDerivacion): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/derivaciones`, payload);
  }

  listarDerivaciones(opts: { estado?: string; consultaId?: string; page?: number; pageSize?: number } = {}) {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<PaginatedResult<DerivacionRow>>(`${this.api}/derivaciones`, { params });
  }

  aprobarDerivacion(id: string, payload: AprobarDerivacion): Observable<{ atencion: Atencion }> {
    return this.http.post<{ atencion: Atencion }>(`${this.api}/derivaciones/${id}/aprobar`, payload);
  }

  rechazarDerivacion(id: string, observacion: string): Observable<unknown> {
    return this.http.post(`${this.api}/derivaciones/${id}/rechazar`, { observacion });
  }

  // --- Contrapartes ---
  contrapartes(id: string): Observable<Contraparte[]> {
    return this.http.get<Contraparte[]>(`${this.base}/${id}/contrapartes`);
  }

  crearContraparte(id: string, payload: CreateContraparte): Observable<Contraparte> {
    return this.http.post<Contraparte>(`${this.base}/${id}/contrapartes`, payload);
  }

  actualizarContraparte(id: string, payload: UpdateContraparte): Observable<Contraparte> {
    return this.http.put<Contraparte>(`${this.api}/contrapartes/${id}`, payload);
  }

  eliminarContraparte(id: string): Observable<Contraparte> {
    return this.http.delete<Contraparte>(`${this.api}/contrapartes/${id}`);
  }
}
