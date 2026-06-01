import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { TenantThrottlerGuard } from "./common/guards/tenant-throttler.guard";
import { DatabaseModule } from "./db/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuditInterceptor } from "./modules/audit/audit.interceptor";
import { MaintenanceInterceptor } from "./common/interceptors/maintenance.interceptor";
import { MetricsModule } from "./modules/metrics/metrics.module";
import { MetricsInterceptor } from "./modules/metrics/metrics.interceptor";
import { UsuariosModule } from "./modules/usuarios/usuarios.module";
import { PlanesModule } from "./modules/planes/planes.module";
import { AfiliadosModule } from "./modules/afiliados/afiliados.module";
import { AtencionesModule } from "./modules/atenciones/atenciones.module";
import { GestionesModule } from "./modules/gestiones/gestiones.module";
import { ComitesModule } from "./modules/comites/comites.module";
import { PagosModule } from "./modules/pagos/pagos.module";
import { CargasMasivasModule } from "./modules/cargas-masivas/cargas-masivas.module";
import { DocumentosModule } from "./modules/documentos/documentos.module";
import { NotificacionesModule } from "./modules/notificaciones/notificaciones.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    // Rate limiting global: 3 tiers para distintos patrones de uso.
    // Cubre brute-force, scraping, y picos abusivos sin bloquear apps internas.
    ThrottlerModule.forRoot([
      { name: "short", ttl: 1_000, limit: 30 }, // 30 req/s burst
      { name: "medium", ttl: 60_000, limit: 600 }, // 600 req/min
      { name: "long", ttl: 3_600_000, limit: 10_000 }, // 10K req/h
    ]),
    DatabaseModule,
    UsuariosModule,
    AuthModule,
    AuditModule,
    MetricsModule,
    HealthModule,
    PlanesModule,
    AfiliadosModule,
    AtencionesModule,
    GestionesModule,
    ComitesModule,
    PagosModule,
    CargasMasivasModule,
    DocumentosModule,
    NotificacionesModule,
    DashboardModule,
    ExportsModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MaintenanceInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
