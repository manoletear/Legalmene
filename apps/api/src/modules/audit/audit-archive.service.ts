import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { lt, sql } from "drizzle-orm";
import { gzipSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DRIZZLE, Database } from "../../db/database.module";
import { auditoria } from "../../db/schema/auditoria";

// Ley 19.628: trazabilidad mínima de 5 años, pero el log activo crece sin freno y degrada
// las consultas. Política: lo de más de 1 año se archiva en gzip y se borra de la tabla.
// Destino: S3 (bucket de documentos, prefijo audit-archive/, que pasa a Glacier al año) en
// producción; una carpeta local solo con AUDIT_ARCHIVE_DIR o STORAGE_BACKEND=local (desarrollo).
// Las filas se borran solo después de que el archivo quedó guardado: en Fargate el disco es
// efímero y un archivo local se perdería con el contenedor.
@Injectable()
export class AuditArchiveService {
  private readonly logger = new Logger(AuditArchiveService.name);
  private readonly dirLocal: string | null;
  private readonly bucket: string;
  private s3?: S3Client;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    const dir = config.get<string>("AUDIT_ARCHIVE_DIR");
    const local = (config.get<string>("STORAGE_BACKEND") ?? "s3") === "local";
    this.dirLocal = dir || local ? resolve(dir ?? "./data/audit-archive") : null;
    this.bucket = config.get<string>("AUDIT_ARCHIVE_BUCKET") ?? config.get<string>("S3_DOCUMENTS_BUCKET") ?? "legalmene-dev-documents";
  }

  // Mensual el día 1 a las 04:00 UTC. Idempotente: si no hay filas, no escribe.
  @Cron("0 4 1 * *")
  async ejecutar(): Promise<{ archivadas: number; archivo?: string } | null> {
    return this.archivar();
  }

  // Punto de entrada para invocación manual desde el endpoint admin.
  async archivar(olderThan?: Date): Promise<{ archivadas: number; archivo?: string }> {
    const cutoff = olderThan ?? new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const rows = await this.db.select().from(auditoria).where(lt(auditoria.timestamp, cutoff));
    if (rows.length === 0) {
      this.logger.log("audit-archive: nada para archivar");
      return { archivadas: 0 };
    }
    const nombre = `auditoria-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl.gz`;
    const cuerpo = gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8"));
    // Si guardar falla, se lanza el error y no se borra nada.
    const archivo = await this.guardar(nombre, cuerpo);
    await this.db.execute(sql`DELETE FROM auditoria WHERE timestamp < ${cutoff}`);
    this.logger.log(`audit-archive: ${rows.length} filas → ${archivo}`);
    return { archivadas: rows.length, archivo };
  }

  private async guardar(nombre: string, cuerpo: Buffer): Promise<string> {
    if (this.dirLocal) {
      mkdirSync(this.dirLocal, { recursive: true });
      const file = join(this.dirLocal, nombre);
      writeFileSync(file, cuerpo);
      return file;
    }
    const key = `audit-archive/${nombre}`;
    this.s3 ??= new S3Client({
      region: this.config.get<string>("AWS_REGION") ?? "sa-east-1",
      endpoint: this.config.get<string>("S3_ENDPOINT"),
      forcePathStyle: !!this.config.get<string>("S3_ENDPOINT"),
    });
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: cuerpo, ContentType: "application/gzip", ServerSideEncryption: "AES256" }),
    );
    return `s3://${this.bucket}/${key}`;
  }
}
