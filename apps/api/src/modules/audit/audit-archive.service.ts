import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { lt, sql } from "drizzle-orm";
import { gzipSync } from "zlib";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { DRIZZLE, Database } from "../../db/database.module";
import { auditoria } from "../../db/schema/auditoria";

// Ley 19.628: trazabilidad mínima de 5 años pero el log activo crece sin
// freno y degrada queries. Política: > 1 año va a archivo gzip + DELETE.
// En prod el archivo va a S3 Glacier (lifecycle del bucket de documents);
// en dev queda en AUDIT_ARCHIVE_DIR.
@Injectable()
export class AuditArchiveService {
  private readonly logger = new Logger(AuditArchiveService.name);
  private readonly archiveDir: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    config: ConfigService,
  ) {
    this.archiveDir = resolve(config.get<string>("AUDIT_ARCHIVE_DIR") ?? "./data/audit-archive");
    if (!existsSync(this.archiveDir)) mkdirSync(this.archiveDir, { recursive: true });
  }

  // Mensual el día 1 a las 04:00 UTC. Idempotente: si no hay filas, no escribe.
  @Cron("0 4 1 * *")
  async ejecutar(): Promise<{ archivadas: number; archivo?: string } | null> {
    return this.archivar();
  }

  // Punto de entrada para invocación manual desde el endpoint admin.
  async archivar(olderThan?: Date): Promise<{ archivadas: number; archivo?: string }> {
    const cutoff = olderThan ?? new Date(Date.now() - 365 * 24 * 3600 * 1000);
    const rows = await this.db
      .select()
      .from(auditoria)
      .where(lt(auditoria.timestamp, cutoff));
    if (rows.length === 0) {
      this.logger.log("audit-archive: nada para archivar");
      return { archivadas: 0 };
    }
    const ts = new Date().toISOString().slice(0, 10);
    const file = join(this.archiveDir, `auditoria-${ts}.jsonl.gz`);
    const jsonl = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    writeFileSync(file, gzipSync(Buffer.from(jsonl, "utf-8")));
    await this.db.execute(sql`DELETE FROM auditoria WHERE timestamp < ${cutoff}`);
    this.logger.log(`audit-archive: ${rows.length} filas → ${file}`);
    return { archivadas: rows.length, archivo: file };
  }
}
