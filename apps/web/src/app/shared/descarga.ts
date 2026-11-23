import { authHeaders } from "../core/interceptors/auth.interceptor";
import { environment } from "../../environments/environment";

export type Parametros = Record<string, string | number | boolean | undefined | null>;

export function queryString(params: Parametros): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Descarga un archivo de la API (XLSX/PDF). Lanza Error con el mensaje de la API si falla
// (p. ej. búsqueda sobre el tope exportable) para mostrarlo en un toast.
export async function descargarArchivo(
  ruta: string,
  nombre: string,
  opciones: { params?: Parametros; body?: unknown } = {},
): Promise<void> {
  const url = `${environment.apiBaseUrl}${ruta}${queryString(opciones.params ?? {})}`;
  const res = await fetch(url, {
    method: opciones.body ? "POST" : "GET",
    headers: { ...authHeaders(), ...(opciones.body ? { "Content-Type": "application/json" } : {}) },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  if (!res.ok) {
    let mensaje = `No se pudo descargar (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j?.message === "string") mensaje = j.message;
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(mensaje);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}
