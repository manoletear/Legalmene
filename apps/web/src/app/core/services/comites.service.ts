import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { BitacoraComite, Comite, ComiteConParticipantes, CompromisoComite, ConvocarComite, CrearCompromiso, ValidarCompromiso } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class ComitesApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listar(atencionId: string): Observable<ComiteConParticipantes[]> {
    return this.http.get<ComiteConParticipantes[]>(`${this.base}/atenciones/${atencionId}/comites`);
  }

  convocar(atencionId: string, payload: Omit<ConvocarComite, "atencionId">): Observable<Comite> {
    return this.http.post<Comite>(`${this.base}/atenciones/${atencionId}/comites`, payload);
  }

  votar(
    comiteId: string,
    payload: { voto: "AFavor" | "EnContra" | "Abstencion"; comentario?: string },
  ): Observable<unknown> {
    return this.http.post(`${this.base}/comites/${comiteId}/votos`, payload);
  }

  cerrar(
    comiteId: string,
    payload: { decision: "Aprobado" | "Rechazado" | "Diferido"; acta: string },
  ): Observable<Comite> {
    return this.http.post<Comite>(`${this.base}/comites/${comiteId}/cerrar`, payload);
  }

  bitacora(comiteId: string): Observable<BitacoraComite> {
    return this.http.get<BitacoraComite>(`${this.base}/comites/${comiteId}/compromisos`);
  }

  agregarCompromiso(comiteId: string, payload: CrearCompromiso): Observable<CompromisoComite> {
    return this.http.post<CompromisoComite>(`${this.base}/comites/${comiteId}/compromisos`, payload);
  }

  validarCompromiso(comiteId: string, compromisoId: string, payload: ValidarCompromiso): Observable<CompromisoComite> {
    return this.http.post<CompromisoComite>(`${this.base}/comites/${comiteId}/compromisos/${compromisoId}/validar`, payload);
  }
}
