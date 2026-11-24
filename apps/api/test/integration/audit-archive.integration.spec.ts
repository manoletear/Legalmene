import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ConfigService } from "@nestjs/config";
import { auditoria } from "../../src/db/schema/auditoria";
import { AuditArchiveService } from "../../src/modules/audit/audit-archive.service";
import type { Database } from "../../src/db/database.module";

const RUN = !!process.env.DATABASE_URL;

// Archivo de auditoría (Ley 19.628): las filas se borran solo si el archivo quedó guardado.
(RUN ? describe : describe.skip)("Archivo de auditoría (integration)", () => {
  let pool: Pool;
  let db: Database;
  const ENTIDAD = `archivo-test-${Date.now()}`;
  const CORTE = new Date("2000-01-01T00:00:00Z");
  let dir: string;

  // Configuración aislada: ConfigService también lee process.env (en CI, STORAGE_BACKEND=local).
  const servicio = (env: Record<string, string>) =>
    new AuditArchiveService(db, { get: (k: string) => env[k] } as unknown as ConfigService);
  const filas = () => drizzle(pool).select().from(auditoria).where(eq(auditoria.entidad, ENTIDAD));
  const sembrar = () =>
    drizzle(pool).insert(auditoria).values([
      { accion: "PRUEBA", entidad: ENTIDAD, entidadId: "1", timestamp: new Date("1999-06-01T00:00:00Z") },
      { accion: "PRUEBA", entidad: ENTIDAD, entidadId: "2", timestamp: new Date("1999-07-01T00:00:00Z") },
    ]);

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool) as unknown as Database;
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle/migrations" });
    dir = mkdtempSync(join(tmpdir(), "audit-archive-"));
  });

  afterAll(async () => {
    await drizzle(pool).delete(auditoria).where(eq(auditoria.entidad, ENTIDAD));
    rmSync(dir, { recursive: true, force: true });
    await pool.end();
  });

  it("si S3 falla, no borra las filas", async () => {
    await sembrar();
    const s3Caido = servicio({ STORAGE_BACKEND: "s3", S3_ENDPOINT: "http://127.0.0.1:9", S3_DOCUMENTS_BUCKET: "no-existe" });
    await expect(s3Caido.archivar(CORTE)).rejects.toThrow();
    expect(await filas()).toHaveLength(2);
  });

  it("con carpeta local configurada archiva en gzip y luego borra", async () => {
    const r = await servicio({ AUDIT_ARCHIVE_DIR: dir }).archivar(CORTE);
    expect(r.archivadas).toBeGreaterThanOrEqual(2);
    expect(existsSync(r.archivo!)).toBe(true);
    expect(readdirSync(dir)).toHaveLength(1);
    expect(await filas()).toEqual([]);
  });
});
