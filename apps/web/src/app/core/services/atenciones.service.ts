import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type {
  Atencion,
  AtencionConMaestros,
  CopagoResultado,
  CreateAtencion,
  DerivarAtencion,
  PaginatedResult,
  UpdateAtencion,
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

  crearConsulta(payload: Omit<CreateAtencion, "tipo">): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/consultas`, payload);
  }

  crearAsesoria(payload: Omit<CreateAtencion, "tipo">): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/asesorias`, payload);
  }

  crearJuicio(payload: Omit<CreateAtencion, "tipo">): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/juicios`, payload);
  }

  derivar(id: string, payload: Omit<DerivarAtencion, "atencionId">): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/${id}/derivar`, payload);
  }
}
