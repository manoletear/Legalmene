import { Global, Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule } from "@nestjs/config";
import { EntraStrategy } from "./entra.strategy";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt-entra" }), ConfigModule],
  providers: [EntraStrategy, JwtAuthGuard],
  exports: [PassportModule, JwtAuthGuard],
})
export class AuthModule {}
