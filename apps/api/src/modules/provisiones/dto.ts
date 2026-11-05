import {
  DevolucionSchema,
  EntregaSchema,
  EstadoProvisionEnum,
  ObservacionSchema,
  PagoClienteSchema,
  RechazoSchema,
  RegistrarMovimientoSchema,
  SolicitarProvisionSchema,
} from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class SolicitarProvisionDto extends createZodDto(SolicitarProvisionSchema) {}
export class RegistrarMovimientoDto extends createZodDto(RegistrarMovimientoSchema) {}
export class PagoClienteDto extends createZodDto(PagoClienteSchema) {}
export class ObservacionDto extends createZodDto(ObservacionSchema) {}
export class RechazoDto extends createZodDto(RechazoSchema) {}
export class EntregaDto extends createZodDto(EntregaSchema) {}
export class DevolucionDto extends createZodDto(DevolucionSchema) {}

export const FiltroProvisionesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  estado: EstadoProvisionEnum.optional(),
  codPlan: z.string().optional(),
});
export class FiltroProvisionesDto extends createZodDto(FiltroProvisionesSchema) {}
