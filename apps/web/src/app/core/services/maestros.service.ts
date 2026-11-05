import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { Competencia, MaestroSimple, Materia, Procedimiento, TipoAtencion, Tribunal } from "@legalmene/shared";

export type TipoMaestro =
  | "competencias"
  | "materias"
  | "procedimientos"
  | "tribunales"
  | "organismos"
  | "tipos-consulta"
  | "causas-termino"
  | "calidades-procesales";

export interface FiltroMaestro {
  vigente?: boolean;
  competenciaId?: string;
  aplicaA?: TipoAtencion;
}

interface PorTipo {
  competencias: Competencia;
  materias: Materia;
  procedimientos: Procedimiento;
  tribunales: Tribunal;
  organismos: MaestroSimple;
  "tipos-consulta": MaestroSimple;
  "causas-termino": MaestroSimple;
  "calidades-procesales": MaestroSimple;
}

@Injectable({ providedIn: "root" })
export class MaestrosApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/maestros`;

  listar<T extends TipoMaestro>(tipo: T, filtro: FiltroMaestro = {}): Observable<PorTipo[T][]> {
    let params = new HttpParams();
    Object.entries(filtro).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params = params.set(k, String(v));
    });
    return this.http.get<PorTipo[T][]>(`${this.base}/${tipo}`, { params });
  }

  crear<T extends TipoMaestro>(tipo: T, body: Partial<PorTipo[T]>): Observable<PorTipo[T]> {
    return this.http.post<PorTipo[T]>(`${this.base}/${tipo}`, body);
  }

  actualizar<T extends TipoMaestro>(tipo: T, id: string, body: Partial<PorTipo[T]>): Observable<PorTipo[T]> {
    return this.http.put<PorTipo[T]>(`${this.base}/${tipo}/${id}`, body);
  }
}
