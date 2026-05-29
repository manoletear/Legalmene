import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { CompletarGestion } from "@legalmene/shared";

export interface GestionGlobalRow {
  id: string;
  atencionId: string;
  tipo: string;
  estado: "Pendiente" | "Completada" | "Vencida" | "Cancelada";
  titulo: string;
  detalle: string | null;
  responsableId: string;
  responsableEmail: string;
  fechaCompromiso: string | null;
  fechaEjecucion: string | null;
  createdAt: string;
  correlativo: string;
  atencionMateria: string;
}

export interface GestionesGlobalPage {
  data: GestionGlobalRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

@Injectable({ providedIn: "root" })
export class GestionesGlobalService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listarGlobal(opts: {
    page?: number;
    pageSize?: number;
    estado?: string;
    tipo?: string;
    soloVencidas?: boolean;
  }): Observable<GestionesGlobalPage> {
    let params = new HttpParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && v !== false) {
        params = params.set(k, String(v));
      }
    });
    return this.http.get<GestionesGlobalPage>(`${this.base}/gestiones`, { params });
  }

  completar(gestionId: string, payload: CompletarGestion): Observable<unknown> {
    return this.http.put(`${this.base}/gestiones/${gestionId}/completar`, payload);
  }
}
