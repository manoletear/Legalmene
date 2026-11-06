import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { CompletarGestion, CreateGestion, Gestion } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class GestionesApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listar(atencionId: string): Observable<Gestion[]> {
    return this.http.get<Gestion[]>(`${this.base}/atenciones/${atencionId}/gestiones`);
  }

  crear(atencionId: string, payload: Omit<CreateGestion, "atencionId">): Observable<Gestion> {
    return this.http.post<Gestion>(`${this.base}/atenciones/${atencionId}/gestiones`, payload);
  }

  completar(gestionId: string, payload: CompletarGestion): Observable<Gestion> {
    return this.http.put<Gestion>(`${this.base}/gestiones/${gestionId}/completar`, payload);
  }
}
