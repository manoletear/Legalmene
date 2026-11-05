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
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { WebhooksService, CrearWebhook } from "./webhooks.service";

@ApiTags("webhooks")
@ApiBearerAuth("EntraID")
@ApiQuery({ name: "codPlan", required: true, description: "Plan de la suscripción" })
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("webhooks")
export class WebhooksController {
  constructor(@Inject(WebhooksService) private readonly service: WebhooksService) {}

  @Get()
  @Permiso("webhooks.ver")
  listar(@PlanRequerido() codPlan: string) {
    return this.service.listar(codPlan);
  }

  @Post()
  @Permiso("webhooks.administrar")
  crear(@PlanRequerido() codPlan: string, @Body() body: CrearWebhook) {
    return this.service.crear(codPlan, body);
  }

  @Patch(":id")
  @Permiso("webhooks.administrar")
  actualizar(
    @PlanRequerido() codPlan: string,
    @Param("id") id: string,
    @Body() body: Partial<CrearWebhook> & { activo?: boolean },
  ) {
    return this.service.actualizar(codPlan, id, body);
  }

  @Delete(":id")
  @Permiso("webhooks.administrar")
  async eliminar(@PlanRequerido() codPlan: string, @Param("id") id: string) {
    await this.service.eliminar(codPlan, id);
    return { ok: true };
  }

  @Get("entregas")
  @Permiso("webhooks.ver")
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
  @Permiso("webhooks.administrar")
  reintentar(@PlanRequerido() codPlan: string, @Param("id") id: string) {
    return this.service.reintentar(codPlan, id);
  }
}
