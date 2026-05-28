import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { AtencionesService } from "./atenciones.service";
import {
  CreateAtencionDto,
  UpdateAtencionDto,
  DerivarAtencionDto,
  FiltroAtencionesDto,
} from "./dto";
import { CodPlan } from "../../common/decorators/cod-plan.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("atenciones")
@ApiBearerAuth("EntraID")
@ApiHeader({ name: "X-Cod-Plan", required: true })
@UseGuards(AuthGuard("jwt-entra"), RolesGuard)
@Controller("atenciones")
export class AtencionesController {
  constructor(private readonly service: AtencionesService) {}

  @Get()
  buscar(@CodPlan() codPlan: string, @Query() filtro: FiltroAtencionesDto) {
    return this.service.buscar(codPlan, filtro);
  }

  @Get(":id")
  obtener(@CodPlan() codPlan: string, @Param("id") id: string) {
    return this.service.obtener(codPlan, id);
  }

  @Post("consultas")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  crearConsulta(@CodPlan() codPlan: string, @Body() body: Omit<CreateAtencionDto, "tipo">) {
    return this.service.crear(codPlan, { ...body, tipo: "Consulta" });
  }

  @Post("asesorias")
  @Roles("Administrador", "Supervisor", "Abogado")
  crearAsesoria(@CodPlan() codPlan: string, @Body() body: Omit<CreateAtencionDto, "tipo">) {
    return this.service.crear(codPlan, { ...body, tipo: "Asesoria" });
  }

  @Post("juicios")
  @Roles("Administrador", "Supervisor", "Abogado")
  crearJuicio(@CodPlan() codPlan: string, @Body() body: Omit<CreateAtencionDto, "tipo">) {
    return this.service.crear(codPlan, { ...body, tipo: "Juicio" });
  }

  @Patch(":id")
  @Roles("Administrador", "Supervisor", "Abogado")
  actualizar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @Body() body: UpdateAtencionDto,
  ) {
    return this.service.actualizar(codPlan, id, body);
  }

  @Post(":id/derivar")
  @Roles("Administrador", "Supervisor", "Abogado")
  derivar(
    @CodPlan() codPlan: string,
    @Param("id") id: string,
    @Body() body: Omit<DerivarAtencionDto, "atencionId">,
  ) {
    return this.service.derivar(codPlan, { ...body, atencionId: id });
  }
}
