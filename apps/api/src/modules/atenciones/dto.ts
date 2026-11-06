import {
  CriteriosBusquedaSchema,
  TipoAtencionEnum,
  AprobarDerivacionSchema,
  CambiarEstadoSchema,
  CreateAtencionSchema,
  CreateContraparteSchema,
  EstadoAtencionEnum,
  EstadoDerivacionEnum,
  NuevoCorrelativoSchema,
  RechazarDerivacionSchema,
  SolicitarDerivacionSchema,
  UpdateAtencionSchema,
  UpdateContraparteSchema,
} from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class CreateAtencionDto extends createZodDto(CreateAtencionSchema) {}
export class UpdateAtencionDto extends createZodDto(UpdateAtencionSchema) {}
export class CambiarEstadoDto extends createZodDto(CambiarEstadoSchema) {}
export class NuevoCorrelativoDto extends createZodDto(NuevoCorrelativoSchema) {}
export class SolicitarDerivacionDto extends createZodDto(SolicitarDerivacionSchema) {}
export class AprobarDerivacionDto extends createZodDto(AprobarDerivacionSchema) {}
export class RechazarDerivacionDto extends createZodDto(RechazarDerivacionSchema) {}
export class CreateContraparteDto extends createZodDto(CreateContraparteSchema) {}
export class UpdateContraparteDto extends createZodDto(UpdateContraparteSchema) {}

export const FiltroAtencionesSchema = CriteriosBusquedaSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  estado: EstadoAtencionEnum.optional(),
  tipo: TipoAtencionEnum.optional(),
  afiliadoId: z.string().uuid().optional(),
  // Búsqueda full-text en asunto/descripcion/correlativo/materia/competencia.
  q: z.string().min(2).optional(),
});
export class FiltroAtencionesDto extends createZodDto(FiltroAtencionesSchema) {}

export const FiltroDerivacionesSchema = CriteriosBusquedaSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  estado: EstadoDerivacionEnum.optional(),
  consultaId: z.string().uuid().optional(),
});
export class FiltroDerivacionesDto extends createZodDto(FiltroDerivacionesSchema) {}
