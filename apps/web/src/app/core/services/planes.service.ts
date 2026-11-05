import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, shareReplay } from "rxjs";
import { environment } from "../../../environments/environment";
import type { Plan } from "@legalmene/shared";

@Injectable({ providedIn: "root" })
export class PlanesApiService {
  private http = inject(HttpClient);
  private planes$?: Observable<Plan[]>;

  // Catálogo de productos; se cachea porque cambia rara vez.
  listar(): Observable<Plan[]> {
    this.planes$ ??= this.http
      .get<Plan[]>(`${environment.apiBaseUrl}/planes`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.planes$;
  }
}
