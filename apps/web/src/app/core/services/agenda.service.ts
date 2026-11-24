import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import type { ActualizarCita, CambiarEstadoCita, Cita, CrearCita, EstadoCita, TipoCita } from "@legalmene/shared";

export interface FiltroAgendaWeb {
  desde: string;
  hasta: string;
  responsableId?: string;
  tipo?: TipoCita[];
  estado?: EstadoCita;
  atencionId?: string;
}

export function paramsAgenda(f: FiltroAgendaWeb): Record<string, string | string[]> {
  const p: Record<string, string | string[]> = { desde: f.desde, hasta: f.hasta };
  if (f.responsableId) p["responsableId"] = f.responsableId;
  if (f.tipo?.length) p["tipo"] = f.tipo;
  if (f.estado) p["estado"] = f.estado;
  if (f.atencionId) p["atencionId"] = f.atencionId;
  return p;
}

@Injectable({ providedIn: "root" })
export class AgendaApiService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/agenda`;

  listar(f: FiltroAgendaWeb): Observable<Cita[]> {
    return this.http.get<Cita[]>(this.base, { params: new HttpParams({ fromObject: paramsAgenda(f) }) });
  }

  crear(body: CrearCita): Observable<Cita> {
    return this.http.post<Cita>(this.base, body);
  }

  actualizar(id: string, body: ActualizarCita): Observable<Cita> {
    return this.http.patch<Cita>(`${this.base}/${id}`, body);
  }

  cambiarEstado(id: string, body: CambiarEstadoCita): Observable<Cita> {
    return this.http.post<Cita>(`${this.base}/${id}/estado`, body);
  }
}
