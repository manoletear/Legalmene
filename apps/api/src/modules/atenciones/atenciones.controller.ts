import {
  Body,
  Controller,
  Inject,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AtencionesService } from "./atenciones.service";
import {
  CreateAtencionDto,
  UpdateAtencionDto,
  DerivarCuerpoDto,
  FiltroAtencionesDto,
} from "./dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";

@ApiTags("atenciones")
@ApiBearerAuth("EntraID")
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("atenciones")
export class AtencionesController {
  constructor(@Inject(AtencionesService) private readonly service: AtencionesService) {}

  @Get()
  buscar(@Query() filtro: FiltroAtencionesDto) {
    return this.service.buscar(filtro);
  }

  @Get(":id")
  obtener(@Param("id") id: string) {
    return this.service.obtener(id);
  }

  @Post("consultas")
  @Roles("Administrador", "Supervisor", "Abogado", "Operador")
  crearConsulta(@Body() body: CreateAtencionDto) {
    return this.service.crear({ ...body, tipo: "Consulta" });
  }

  @Post("asesorias")
  @Roles("Administrador", "Supervisor", "Abogado")
  crearAsesoria(@Body() body: CreateAtencionDto) {
    return this.service.crear({ ...body, tipo: "Asesoria" });
  }

  @Post("juicios")
  @Roles("Administrador", "Supervisor", "Abogado")
  crearJuicio(@Body() body: CreateAtencionDto) {
    return this.service.crear({ ...body, tipo: "Juicio" });
  }

  @Patch(":id")
  @Roles("Administrador", "Supervisor", "Abogado")
  actualizar(@Param("id") id: string, @Body() body: UpdateAtencionDto) {
    return this.service.actualizar(id, body);
  }

  @Post(":id/derivar")
  @Roles("Administrador", "Supervisor", "Abogado")
  derivar(@Param("id") id: string, @Body() body: DerivarCuerpoDto) {
    return this.service.derivar({ ...body, atencionId: id });
  }
}
