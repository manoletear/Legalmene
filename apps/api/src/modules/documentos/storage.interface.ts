// Abstracción de almacenamiento de documentos.
// Implementaciones: S3 (prod) y LocalFs (dev sin AWS).
export interface DocumentStorage {
  /** Devuelve URL firmada (o local equivalente) para PUT. */
  generateUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSec: number;
  }): Promise<string>;

  /** Verifica que el objeto exista (post-upload). */
  exists(key: string): Promise<boolean>;

  /** Devuelve URL firmada (o local equivalente) para GET. */
  generateDownloadUrl(input: {
    key: string;
    filename: string;
    expiresInSec: number;
  }): Promise<string>;

  /** Identificador del bucket lógico (para guardar en documentos.s3Bucket). */
  readonly bucketName: string;
}
