import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule } from "./db/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuditInterceptor } from "./modules/audit/audit.interceptor";
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
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    DatabaseModule,
    UsuariosModule,
    AuthModule,
    AuditModule,
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
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
