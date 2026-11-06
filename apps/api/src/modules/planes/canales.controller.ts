import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { asc } from "drizzle-orm";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermisosGuard } from "../../common/guards/permisos.guard";
import { DRIZZLE, Database } from "../../db/database.module";
import { canales } from "../../db/schema/planes";

@ApiTags("planes")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, PermisosGuard)
@Controller("canales")
export class CanalesController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  listar() {
    return this.db.select().from(canales).orderBy(asc(canales.nombre));
  }
}
