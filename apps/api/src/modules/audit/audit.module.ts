import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditController } from "./audit.controller";
import { AuditArchiveService } from "./audit-archive.service";

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor, AuditArchiveService],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
