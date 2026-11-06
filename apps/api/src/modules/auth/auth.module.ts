import { Global, Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule } from "@nestjs/config";
import { EntraStrategy } from "./entra.strategy";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AuthController } from "./auth.controller";
import { EnlacesAccesoService } from "./enlaces-acceso.service";
import { NotificacionesModule } from "../notificaciones/notificaciones.module";

@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt-entra" }), ConfigModule, NotificacionesModule],
  controllers: [AuthController],
  providers: [EntraStrategy, JwtAuthGuard, EnlacesAccesoService],
  exports: [PassportModule, JwtAuthGuard],
})
export class AuthModule {}
