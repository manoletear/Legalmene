import { Controller, Get, Header, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ExportsService } from "./exports.service";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("exports")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("exports")
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Get("afiliados.csv")
  @Roles("Administrador", "Supervisor", "Auditor")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async afiliados(@CodPlan() codPlan: string, @Res() res: Response) {
    const csv = await this.service.afiliadosCsv(codPlan);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="afiliados-${codPlan}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    // BOM para que Excel detecte UTF-8 automáticamente.
    res.send("﻿" + csv);
  }

  @Get("atenciones.csv")
  @Roles("Administrador", "Supervisor", "Auditor")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async atenciones(@CodPlan() codPlan: string, @Res() res: Response) {
    const csv = await this.service.atencionesCsv(codPlan);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="atenciones-${codPlan}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send("﻿" + csv);
  }
}
