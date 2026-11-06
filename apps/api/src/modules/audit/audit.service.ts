import { Inject, Injectable, Logger } from "@nestjs/common";
import { DRIZZLE, Database } from "../../db/database.module";
import { auditoria, NuevaAuditoria } from "../../db/schema/auditoria";

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  accion: string;
  entidad: string;
  entidadId: string;
  codPlan?: string | null;
  cambios?: { before?: unknown; after?: unknown };
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Best-effort: si falla, log pero no rompe la request del usuario.
  async log(entry: AuditEntry): Promise<void> {
    try {
      const payload: NuevaAuditoria = {
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        accion: entry.accion,
        entidad: entry.entidad,
        entidadId: entry.entidadId,
        codPlan: entry.codPlan ?? null,
        cambios: entry.cambios ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      };
      await this.db.insert(auditoria).values(payload);
    } catch (err) {
      this.logger.error(
        `Audit log failed for ${entry.entidad}/${entry.entidadId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
