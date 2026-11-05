import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PlanRequerido } from "../../common/decorators/plan-requerido.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WebhooksService, CrearWebhook } from "./webhooks.service";

@ApiTags("webhooks")
@ApiBearerAuth("EntraID")
@ApiQuery({ name: "codPlan", required: true, description: "Plan de la suscripción" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("webhooks")
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly service: WebhooksService) {}

  @Get()
  @Roles("Administrador", "Supervisor")
  listar(@PlanRequerido() codPlan: string) {
    return this.service.listar(codPlan);
  }

  @Post()
  @Roles("Administrador")
  crear(@PlanRequerido() codPlan: string, @Body() body: CrearWebhook) {
    return this.service.crear(codPlan, body);
  }

  @Patch(":id")
  @Roles("Administrador")
  actualizar(
    @PlanRequerido() codPlan: string,
    @Param("id") id: string,
    @Body() body: Partial<CrearWebhook> & { activo?: boolean },
  ) {
    return this.service.actualizar(codPlan, id, body);
  }

  @Delete(":id")
  @Roles("Administrador")
  async eliminar(@PlanRequerido() codPlan: string, @Param("id") id: string) {
    await this.service.eliminar(codPlan, id);
    return { ok: true };
  }

  @Get("entregas")
  @Roles("Administrador", "Supervisor", "Auditor")
  entregas(
    @PlanRequerido() codPlan: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("estado") estado?: string,
  ) {
    return this.service.entregas(codPlan, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      estado,
    });
  }

  @Post("entregas/:id/reintentar")
  @Roles("Administrador", "Supervisor")
  reintentar(@PlanRequerido() codPlan: string, @Param("id") id: string) {
    return this.service.reintentar(codPlan, id);
  }
}
