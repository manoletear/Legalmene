import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, shareReplay, tap } from "rxjs";
import { environment } from "../../../environments/environment";
import type { Canal, CopiarCoberturas, CopiarCoberturasResultado, CreatePlan, Plan, PlanResumen, UpdatePlan } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class PlanesApiService {
  private http = inject(HttpClient);
  private planes$?: Observable<PlanResumen[]>;
  private canales$?: Observable<Canal[]>;

  // Catálogo de productos; se cachea porque cambia rara vez (se invalida al crear o editar).
  listar(): Observable<PlanResumen[]> {
    this.planes$ ??= this.http
      .get<PlanResumen[]>(`${environment.apiBaseUrl}/planes`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.planes$;
  }

  canales(): Observable<Canal[]> {
    this.canales$ ??= this.http
      .get<Canal[]>(`${environment.apiBaseUrl}/canales`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.canales$;
  }

  crear(payload: CreatePlan): Observable<Plan> {
    return this.http.post<Plan>(`${environment.apiBaseUrl}/planes`, payload).pipe(tap(() => (this.planes$ = undefined)));
  }

  actualizar(codPlan: string, patch: UpdatePlan): Observable<Plan> {
    return this.http
      .patch<Plan>(`${environment.apiBaseUrl}/planes/${encodeURIComponent(codPlan)}`, patch)
      .pipe(tap(() => (this.planes$ = undefined)));
  }

  copiarCoberturas(codPlan: string, body: CopiarCoberturas): Observable<CopiarCoberturasResultado> {
    return this.http
      .post<CopiarCoberturasResultado>(`${environment.apiBaseUrl}/planes/${encodeURIComponent(codPlan)}/coberturas/copiar`, body)
      .pipe(tap(() => (this.planes$ = undefined)));
  }
}
