import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("dashboard")
@ApiBearerAuth("EntraID")
@ApiQuery({ name: "codPlan", required: false, description: "Filtra por plan; sin valor = todos" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly service: DashboardService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // La key de caché incluye el filtro de plan ("todos" si no viene).
  @Get("kpis")
  async kpis(@Query("codPlan") codPlan: string | undefined) {
    const key = `dashboard:kpis:${codPlan ?? "todos"}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const fresh = await this.service.kpis(codPlan);
    await this.cache.set(key, fresh, 60_000);
    return fresh;
  }

  // Resumen liviano (no cacheado) para el badge de notificaciones del front.
  @Get("notificaciones")
  async notificaciones(@Query("codPlan") codPlan: string | undefined) {
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
  async timeline(@Query("codPlan") codPlan: string | undefined, @Query("dias") dias?: string) {
    const d = dias ? parseInt(dias, 10) : 30;
    const key = `dashboard:timeline:${codPlan ?? "todos"}:${d}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const fresh = await this.service.timelineAtenciones(codPlan, d);
    await this.cache.set(key, fresh, 60_000);
    return fresh;
  }

  @Get("por-competencia")
  async porCompetencia(@Query("codPlan") codPlan: string | undefined) {
    const key = `dashboard:competencia:${codPlan ?? "todos"}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const fresh = await this.service.porCompetencia(codPlan);
    await this.cache.set(key, fresh, 60_000);
    return fresh;
  }

  @Get("carga-abogados")
  async cargaAbogados(@Query("codPlan") codPlan: string | undefined, @Query("limit") limit?: string) {
    const l = limit ? parseInt(limit, 10) : 10;
    const key = `dashboard:abogados:${codPlan ?? "todos"}:${l}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const fresh = await this.service.cargaPorAbogado(codPlan, l);
    await this.cache.set(key, fresh, 60_000);
    return fresh;
  }

  @Get("por-mes")
  async porMes(@Query("codPlan") codPlan: string | undefined, @Query("meses") meses?: string) {
    const m = meses ? parseInt(meses, 10) : 12;
    const key = `dashboard:mes:${codPlan ?? "todos"}:${m}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;
    const fresh = await this.service.porMes(codPlan, m);
    await this.cache.set(key, fresh, 60_000);
    return fresh;
  }
}
