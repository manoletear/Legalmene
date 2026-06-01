import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("dashboard")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly service: DashboardService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // CacheInterceptor de Nest no compone bien con headers tenant-scoped, así
  // que armamos la key manualmente con codPlan para mantener aislamiento.
  @Get("kpis")
  async kpis(@CodPlan() codPlan: string) {
    const key = `dashboard:kpis:${codPlan}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const fresh = await this.service.kpis(codPlan);
    await this.cache.set(key, fresh, 60_000);
    return fresh;
  }

  // Resumen liviano (no cacheado) para el badge de notificaciones del front.
  @Get("notificaciones")
  async notificaciones(@CodPlan() codPlan: string) {
    const k = await this.service.kpis(codPlan);
    const items: { id: string; severidad: "info" | "warn" | "critical"; titulo: string; detalle?: string }[] = [];
    if (k.gestiones.vencidas > 0) {
      items.push({
        id: "gestiones-vencidas",
        severidad: "critical",
        titulo: `${k.gestiones.vencidas} gestiones vencidas`,
        detalle: "Tienen fecha de compromiso pasada y siguen pendientes.",
      });
    }
    if (k.gestiones.pendientes > 0) {
      items.push({
        id: "gestiones-pendientes",
        severidad: "info",
        titulo: `${k.gestiones.pendientes} gestiones pendientes`,
      });
    }
    if (k.comites.abiertos > 0) {
      items.push({
        id: "comites-abiertos",
        severidad: "warn",
        titulo: `${k.comites.abiertos} comités abiertos`,
        detalle: "Requieren votación o cierre.",
      });
    }
    return { count: items.filter((i) => i.severidad !== "info").length, items };
  }

  @Get("timeline-atenciones")
  async timeline(@CodPlan() codPlan: string, @Query("dias") dias?: string) {
    const d = dias ? parseInt(dias, 10) : 30;
    const key = `dashboard:timeline:${codPlan}:${d}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const fresh = await this.service.timelineAtenciones(codPlan, d);
    await this.cache.set(key, fresh, 60_000);
    return fresh;
  }
}
