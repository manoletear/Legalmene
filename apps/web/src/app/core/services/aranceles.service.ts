import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { ArancelConValor, CreateArancel, UpdateArancel, ValorUf } from "@legalmene/shared";

export interface ArancelesRespuesta {
  uf: ValorUf | null;
  data: ArancelConValor[];
}

@Injectable({ providedIn: "root" })
export class ArancelesApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listar(opts: { competenciaId?: string; materiaId?: string; soloVigentes?: boolean } = {}): Observable<ArancelesRespuesta> {
    let params = new HttpParams();
    if (opts.competenciaId) params = params.set("competenciaId", opts.competenciaId);
    if (opts.materiaId) params = params.set("materiaId", opts.materiaId);
    if (opts.soloVigentes) params = params.set("soloVigentes", "true");
    return this.http.get<ArancelesRespuesta>(`${this.base}/aranceles`, { params });
  }

  crear(payload: CreateArancel): Observable<ArancelConValor> {
    return this.http.post<ArancelConValor>(`${this.base}/aranceles`, payload);
  }

  actualizar(id: string, patch: UpdateArancel): Observable<ArancelConValor> {
    return this.http.put<ArancelConValor>(`${this.base}/aranceles/${id}`, patch);
  }

  registrarUf(payload: ValorUf): Observable<ValorUf> {
    return this.http.put<ValorUf>(`${this.base}/valores-uf`, payload);
  }
}
