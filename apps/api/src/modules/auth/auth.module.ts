import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule } from "@nestjs/config";
import { EntraStrategy } from "./entra.strategy";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt-entra" }), ConfigModule],
  providers: [EntraStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
