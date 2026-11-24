import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type {
  Competencia,
  CreateGestionPlantilla,
  GestionPlantilla,
  Lugar,
  MaestroSimple,
  Materia,
  Procedimiento,
  Region,
  TipoAtencion,
  Tribunal,
  UpdateGestionPlantilla,
} from "@legalmene/shared";

export type TipoMaestro =
  | "competencias"
  | "materias"
  | "procedimientos"
  | "tribunales"
  | "organismos"
  | "tipos-consulta"
  | "causas-termino"
  | "calidades-procesales"
  | "canales"
  | "regiones"
  | "ciudades"
  | "comunas";

export interface FiltroMaestro {
  vigente?: boolean;
  competenciaId?: string;
  regionId?: string;
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
  canales: MaestroSimple;
  regiones: Region;
  ciudades: Lugar;
  comunas: Lugar;
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

  listarPlantillas(filtro: { materiaId?: string; procedimientoId?: string } = {}): Observable<GestionPlantilla[]> {
    let params = new HttpParams();
    Object.entries(filtro).forEach(([k, v]) => {
      if (v) params = params.set(k, v);
    });
    return this.http.get<GestionPlantilla[]>(`${environment.apiBaseUrl}/gestiones-plantilla`, { params });
  }

  crearPlantilla(body: CreateGestionPlantilla): Observable<GestionPlantilla> {
    return this.http.post<GestionPlantilla>(`${environment.apiBaseUrl}/gestiones-plantilla`, body);
  }

  actualizarPlantilla(id: string, body: UpdateGestionPlantilla): Observable<GestionPlantilla> {
    return this.http.put<GestionPlantilla>(`${environment.apiBaseUrl}/gestiones-plantilla/${id}`, body);
  }
}
