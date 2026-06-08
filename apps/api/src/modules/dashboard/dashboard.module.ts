import { Module } from "@nestjs/common";
import { CacheModule } from "@nestjs/cache-manager";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  // KPIs/timelines re-fetchados con frecuencia; TTL 60s reduce carga en
  // Postgres sin sacrificar frescura para dashboards.
  imports: [CacheModule.register({ ttl: 60_000, max: 200 })],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
