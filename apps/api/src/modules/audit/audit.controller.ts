import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { and, count, desc, eq } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { auditoria } from "../../db/schema/auditoria";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("auditoria")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("auditoria")
export class AuditController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Solo Administrador y Auditor pueden ver el log (cumplimiento Ley 19.628).
  @Get()
  @Roles("Administrador", "Auditor")
  async listar(
    @Query("entidad") entidad?: string,
    @Query("entidadId") entidadId?: string,
    @Query("actorId") actorId?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "50",
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const where = and(
      entidad ? eq(auditoria.entidad, entidad) : undefined,
      entidadId ? eq(auditoria.entidadId, entidadId) : undefined,
      actorId ? eq(auditoria.actorId, actorId) : undefined,
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(auditoria)
        .where(where)
        .orderBy(desc(auditoria.timestamp))
        .limit(ps)
        .offset((p - 1) * ps),
      this.db.select({ value: count() }).from(auditoria).where(where),
    ]);
    return { data: rows, page: p, pageSize: ps, total, totalPages: Math.ceil(total / ps) };
  }
}
