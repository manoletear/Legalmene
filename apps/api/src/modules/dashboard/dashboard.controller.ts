import { Controller, Get, Query, UseGuards } from "@nestjs/common";
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
  constructor(private readonly service: DashboardService) {}

  @Get("kpis")
  kpis(@CodPlan() codPlan: string) {
    return this.service.kpis(codPlan);
  }

  @Get("timeline-atenciones")
  timeline(@CodPlan() codPlan: string, @Query("dias") dias?: string) {
    return this.service.timelineAtenciones(codPlan, dias ? parseInt(dias, 10) : 30);
  }
}
