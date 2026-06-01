import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { WebhooksService, CrearWebhook } from "./webhooks.service";

@ApiTags("webhooks")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Get()
  @Roles("Administrador", "Supervisor")
  listar(@CodPlan() codPlan: string) {
    return this.service.listar(codPlan);
  }

  @Post()
  @Roles("Administrador")
  crear(@CodPlan() codPlan: string, @Body() body: CrearWebhook) {
    return this.service.crear(codPlan, body);
  }

  @Patch(":id")
  @Roles("Administrador")
  actualizar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @Body() body: Partial<CrearWebhook> & { activo?: boolean },
  ) {
    return this.service.actualizar(codPlan, id, body);
  }

  @Delete(":id")
  @Roles("Administrador")
  async eliminar(@CodPlan() codPlan: string, @Param("id") id: string) {
    await this.service.eliminar(codPlan, id);
    return { ok: true };
  }

  @Get("entregas")
  @Roles("Administrador", "Supervisor", "Auditor")
  entregas(
    @CodPlan() codPlan: string,
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
}
