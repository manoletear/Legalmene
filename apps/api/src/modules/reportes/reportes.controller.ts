import { Body, Controller, Get, Inject, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import type { Response } from "express";
import { InformeAtencionesSchema, PeriodoSchema } from "@legalmene/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Permiso } from "../../common/decorators/permiso.decorator";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { MIME_XLSX } from "../exports/xlsx";
import { ReportesService } from "./reportes.service";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
class PlanDto extends createZodDto(PeriodoSchema.and(z.object({ codPlan: z.string().optional() }))) {}
class CanalDto extends createZodDto(PeriodoSchema.and(z.object({ canalId: z.string().uuid().optional() }))) {}
class AfiliadosMesDto extends createZodDto(
  PeriodoSchema.and(z.object({ codPlan: z.string().optional(), canalId: z.string().uuid().optional() })),
) {}
class InformeDto extends createZodDto(InformeAtencionesSchema) {}
class ControllerDto extends createZodDto(
  z.object({
    desde: fecha.optional(),
    hasta: fecha.optional(),
    perfilId: z.string().uuid().optional(),
    jefeId: z.string().uuid().optional(),
    codPlan: z.string().optional(),
    canalId: z.string().uuid().optional(),
  }),
) {}

function enviarXlsx(res: Response, nombre: string, archivo: Buffer) {
  res.setHeader("Content-Type", MIME_XLSX);
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(archivo);
}

@ApiTags("reportes")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("reportes")
export class ReportesController {
  constructor(@Inject(ReportesService) private readonly service: ReportesService) {}

  @Get("plan")
  @Permiso("reportes.ver")
  porPlan(@Query() q: PlanDto) {
    return this.service.porPlan(q, q.codPlan);
  }

  @Get("plan.xlsx")
  @Permiso("reportes.ver")
  async porPlanXlsx(@Query() q: PlanDto, @Res() res: Response) {
    enviarXlsx(res, "reporte-plan", await this.service.xlsxPorPlan(q, q.codPlan));
  }

  @Get("canal")
  @Permiso("reportes.ver")
  porCanal(@Query() q: CanalDto) {
    return this.service.porCanal(q, q.canalId);
  }

  @Get("canal.xlsx")
  @Permiso("reportes.ver")
  async porCanalXlsx(@Query() q: CanalDto, @Res() res: Response) {
    enviarXlsx(res, "reporte-canal", await this.service.xlsxPorCanal(q, q.canalId));
  }

  @Get("afiliados-mes")
  @Permiso("reportes.ver")
  afiliadosMes(@Query() q: AfiliadosMesDto) {
    return this.service.afiliadosPorMes(q, q);
  }

  @Get("afiliados-mes.xlsx")
  @Permiso("reportes.ver")
  async afiliadosMesXlsx(@Query() q: AfiliadosMesDto, @Res() res: Response) {
    enviarXlsx(res, "afiliados-activos", await this.service.xlsxAfiliadosMes(q, q));
  }

  @Post("informe.xlsx")
  @Permiso("reportes.ver")
  async informe(@Body() body: InformeDto, @Res() res: Response) {
    enviarXlsx(res, "informe-atenciones", await this.service.informeXlsx(body));
  }

  @Get("controller")
  @Permiso("controller.ver")
  controller(@Query() q: ControllerDto) {
    return this.service.controller(q);
  }

  @Get("controller.xlsx")
  @Permiso("controller.ver")
  async controllerXlsx(@Query() q: ControllerDto, @Res() res: Response) {
    enviarXlsx(res, "controller-usuarios", await this.service.controllerXlsx(q));
  }
}
