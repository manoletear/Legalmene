import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type {
  Causante,
  CreatePosesion,
  Heredero,
  HerederoInput,
  PosesionEfectiva,
  AprobarDerivacion,
  ArancelAtencion,
  ArancelAtencionRow,
  EventoFinanciero,
  PagoArancel,
  Atencion,
  AtencionConMaestros,
  FichaAtencion,
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
  CriteriosBusqueda,
  TipoAtencion,
} from "@legalmene/shared";

export interface BuscarAtencionesOpts extends Partial<CriteriosBusqueda> {
  page?: number;
  pageSize?: number;
  tipo?: TipoAtencion;
  estado?: string;
  afiliadoId?: string;
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

  obtener(id: string): Observable<FichaAtencion> {
    return this.http.get<FichaAtencion>(`${this.base}/${id}`);
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

  crearPosesion(payload: Omit<CreatePosesion, "causante"> & { causante?: Causante }): Observable<Atencion> {
    return this.http.post<Atencion>(`${this.base}/posesiones`, payload);
  }

  posesion(id: string): Observable<PosesionEfectiva> {
    return this.http.get<PosesionEfectiva>(`${this.base}/${id}/posesion`);
  }

  actualizarCausante(id: string, causante: Causante): Observable<PosesionEfectiva> {
    return this.http.put<PosesionEfectiva>(`${this.base}/${id}/posesion`, causante);
  }

  agregarHeredero(id: string, h: HerederoInput): Observable<Heredero> {
    return this.http.post<Heredero>(`${this.base}/${id}/herederos`, h);
  }

  quitarHeredero(herederoId: string): Observable<{ id: string }> {
    return this.http.delete<{ id: string }>(`${this.api}/herederos/${herederoId}`);
  }

  // --- Derivaciones ---
  solicitarDerivacion(id: string, payload: SolicitarDerivacion): Observable<unknown> {
    return this.http.post(`${this.base}/${id}/derivaciones`, payload);
  }

  listarDerivaciones(opts: Partial<CriteriosBusqueda> & { estado?: string; consultaId?: string; page?: number; pageSize?: number } = {}) {
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

  // --- Arancel (copago) de la atención ---
  arancel(id: string): Observable<ArancelAtencion | null> {
    return this.http.get<ArancelAtencion | null>(`${this.base}/${id}/arancel`);
  }

  arancelEventos(id: string): Observable<EventoFinanciero[]> {
    return this.http.get<EventoFinanciero[]>(`${this.base}/${id}/arancel/eventos`);
  }

  enviarArancel(id: string): Observable<ArancelAtencion> {
    return this.http.post<ArancelAtencion>(`${this.base}/${id}/arancel/enviar`, {});
  }

  aprobarArancel(id: string, observacion?: string): Observable<ArancelAtencion> {
    return this.http.post<ArancelAtencion>(`${this.base}/${id}/arancel/aprobar`, { observacion });
  }

  rechazarArancel(id: string, observacion: string): Observable<ArancelAtencion> {
    return this.http.post<ArancelAtencion>(`${this.base}/${id}/arancel/rechazar`, { observacion });
  }

  pagarArancel(id: string, payload: PagoArancel): Observable<ArancelAtencion> {
    return this.http.post<ArancelAtencion>(`${this.base}/${id}/arancel/pago`, payload);
  }

  arancelesPorEstado(estado?: string, criterios: Record<string, string | undefined> = {}): Observable<ArancelAtencionRow[]> {
    let params = new HttpParams();
    if (estado) params = params.set("estado", estado);
    for (const [k, v] of Object.entries(criterios)) if (v) params = params.set(k, v);
    return this.http.get<ArancelAtencionRow[]>(`${this.api}/aranceles-atencion`, { params });
  }
}
