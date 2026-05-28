import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { PG_POOL } from "../../db/database.module";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  async check() {
    let db: "ok" | "error" = "ok";
    let dbError: string | undefined;
    try {
      await this.pool.query("SELECT 1");
    } catch (err) {
      db = "error";
      dbError = err instanceof Error ? err.message : "unknown";
    }
    return {
      status: db === "ok" ? "ok" : "degraded",
      checks: { db, dbError },
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
