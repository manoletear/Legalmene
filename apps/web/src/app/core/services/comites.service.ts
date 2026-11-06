import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { Comite, ConvocarComite } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class ComitesApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listar(atencionId: string): Observable<Comite[]> {
    return this.http.get<Comite[]>(`${this.base}/atenciones/${atencionId}/comites`);
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
}
