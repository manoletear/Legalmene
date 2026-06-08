import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { CargaMasivaResultado, TipoCargaMasiva } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class CargasMasivasApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/cargas-masivas`;

  cargarAfiliados(tipo: TipoCargaMasiva, file: File): Observable<CargaMasivaResultado> {
    const form = new FormData();
    form.append("archivo", file);
    const params = new HttpParams().set("tipo", tipo);
    return this.http.post<CargaMasivaResultado>(`${this.base}/afiliados`, form, { params });
  }
}
