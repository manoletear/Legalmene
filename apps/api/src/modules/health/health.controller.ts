import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Pool } from "pg";
import { PG_POOL } from "../../db/database.module";

interface CheckResult {
  status: "ok" | "error";
  detail?: string;
  latencyMs?: number;
}

// Bypass rate limiter para health checks: ALB / k8s liveness probes pueden
// hacer cientos de checks por minuto.
@ApiTags("health")
@Throttle({ default: { limit: 10_000, ttl: 60_000 } })
@Controller("health")
export class HealthController {
  private readonly version: string;
  private readonly storageBackend: string;
  private readonly started = Date.now();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {
    this.version = process.env.npm_package_version ?? "0.1.0";
    this.storageBackend = config.get<string>("STORAGE_BACKEND") ?? "s3";
  }

  // Liveness: solo confirma que el proceso responde. ALB lo usa.
  @Get("live")
  live() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  // Readiness: chequea dependencias críticas. ALB target-group usa esto.
  @Get()
  async check() {
    const checks: Record<string, CheckResult> = {
      db: await this.checkDb(),
      storage: this.checkStorageConfig(),
    };
    const status = Object.values(checks).every((c) => c.status === "ok") ? "ok" : "degraded";
    return {
      status,
      version: this.version,
      uptimeSec: Math.round((Date.now() - this.started) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDb(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const { rows } = await this.pool.query("SELECT version() AS version");
      const banner = String((rows[0] as { version?: string })?.version ?? "");
      return {
        status: "ok",
        latencyMs: Date.now() - start,
        detail: banner.split(" ").slice(0, 2).join(" ") || undefined,
      };
    } catch (err) {
      return {
        status: "error",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "unknown",
      };
    }
  }

  // Configuración: verifica que el backend tiene credenciales mínimas.
  // No hace HEAD a S3 para evitar latencia en cada probe.
  private checkStorageConfig(): CheckResult {
    if (this.storageBackend === "local") {
      const dir = this.config.get<string>("DOCUMENTS_LOCAL_DIR");
      return dir
        ? { status: "ok", detail: `local: ${dir}` }
        : { status: "error", detail: "DOCUMENTS_LOCAL_DIR missing" };
    }
    const bucket = this.config.get<string>("S3_DOCUMENTS_BUCKET");
    const region = this.config.get<string>("AWS_REGION");
    if (!bucket || !region) {
      return { status: "error", detail: "S3_DOCUMENTS_BUCKET or AWS_REGION missing" };
    }
    return { status: "ok", detail: `s3: ${bucket} @ ${region}` };
  }
}
