import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, from, switchMap } from "rxjs";
import { environment } from "../../../environments/environment";

export interface DocumentoMeta {
  id: string;
  atencionId: string | null;
  nombre: string;
  mimeType: string;
  tamanoBytes: number;
  s3Bucket: string;
  s3Key: string;
  sha256: string;
  subidoPor: string;
  fechaSubida: string;
}

export interface UploadUrlResp {
  uploadUrl: string;
  s3Key: string;
  expiresInSec: number;
}

@Injectable({ providedIn: "root" })
export class DocumentosApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;

  listar(atencionId: string): Observable<DocumentoMeta[]> {
    return this.http.get<DocumentoMeta[]>(`${this.base}/atenciones/${atencionId}/documentos`);
  }

  getDownloadUrl(id: string): Observable<{ url: string; expiresInSec: number }> {
    return this.http.get<{ url: string; expiresInSec: number }>(
      `${this.base}/documentos/${id}/download-url`,
    );
  }

  // Flujo completo:
  // 1) POST /documentos/upload-url -> {uploadUrl, s3Key}
  // 2) PUT uploadUrl con el archivo (browser -> S3 directo, o -> API en dev local)
  // 3) Calcular SHA-256 del archivo
  // 4) POST /documentos con metadata
  upload(atencionId: string | undefined, file: File): Observable<DocumentoMeta> {
    const meta = {
      atencionId,
      nombre: file.name,
      mimeType: file.type || "application/octet-stream",
      tamanoBytes: file.size,
    };
    return this.http.post<UploadUrlResp>(`${this.base}/documentos/upload-url`, meta).pipe(
      switchMap((resp) =>
        from(
          (async () => {
            // PUT raw body al uploadUrl (S3 presigned o local HMAC).
            const put = await fetch(resp.uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": meta.mimeType },
              body: file,
            });
            if (!put.ok) throw new Error(`Upload falló: HTTP ${put.status}`);
            const sha256 = await this.sha256(file);
            return { s3Key: resp.s3Key, sha256 };
          })(),
        ),
      ),
      switchMap(({ s3Key, sha256 }) =>
        this.http.post<DocumentoMeta>(`${this.base}/documentos`, { ...meta, s3Key, sha256 }),
      ),
    );
  }

  private async sha256(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
