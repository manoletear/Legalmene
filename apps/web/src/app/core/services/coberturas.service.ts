import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type {
  CoberturaConMaestros,
  CopagoResultado,
  CreateCobertura,
  TipoAtencion,
  UpdateCobertura,
} from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class CoberturasApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listar(codPlan: string): Observable<CoberturaConMaestros[]> {
    return this.http.get<CoberturaConMaestros[]>(`${this.base}/coberturas`, {
      params: new HttpParams().set("codPlan", codPlan),
    });
  }

  crear(payload: CreateCobertura): Observable<CoberturaConMaestros> {
    return this.http.post<CoberturaConMaestros>(`${this.base}/coberturas`, payload);
  }

  actualizar(id: string, patch: UpdateCobertura): Observable<CoberturaConMaestros> {
    return this.http.put<CoberturaConMaestros>(`${this.base}/coberturas/${id}`, patch);
  }

  copago(codPlan: string, materiaId: string, tipo: TipoAtencion): Observable<CopagoResultado> {
    const params = new HttpParams().set("codPlan", codPlan).set("materiaId", materiaId).set("tipo", tipo);
    return this.http.get<CopagoResultado>(`${this.base}/copago`, { params });
  }
}
