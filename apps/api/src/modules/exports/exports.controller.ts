import { Controller, Get, Header, Inject, Param, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ExportsService } from "./exports.service";
import { AtencionPdfService } from "./atencion-pdf.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("exports")
@ApiBearerAuth("EntraID")
@ApiQuery({ name: "codPlan", required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("exports")
export class ExportsController {
  constructor(
    @Inject(ExportsService) private readonly service: ExportsService,
    @Inject(AtencionPdfService) private readonly pdf: AtencionPdfService,
  ) {}

  @Get("afiliados.csv")
  @Roles("Administrador", "Supervisor", "Auditor")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async afiliados(@Query("codPlan") codPlan: string | undefined, @Res() res: Response) {
    const csv = await this.service.afiliadosCsv(codPlan);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="afiliados-${codPlan ?? "todos"}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    // BOM para que Excel detecte UTF-8 automáticamente.
    res.send("﻿" + csv);
  }

  @Get("atenciones.csv")
  @Roles("Administrador", "Supervisor", "Auditor")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async atenciones(@Query("codPlan") codPlan: string | undefined, @Res() res: Response) {
    const csv = await this.service.atencionesCsv(codPlan);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="atenciones-${codPlan ?? "todos"}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send("﻿" + csv);
  }

  @Get("atenciones/:id.pdf")
  @Header("Content-Type", "application/pdf")
  async atencionPdf(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Disposition", `attachment; filename="atencion-${id}.pdf"`);
    await this.pdf.generar(id, res);
  }
}
