import {
  EstadoProvisionEnum,
  RegistrarMovimientoSchema,
  ResolverProvisionSchema,
  SolicitarProvisionSchema,
} from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class SolicitarProvisionDto extends createZodDto(SolicitarProvisionSchema) {}
export class ResolverProvisionDto extends createZodDto(ResolverProvisionSchema) {}
export class RegistrarMovimientoDto extends createZodDto(RegistrarMovimientoSchema) {}

export const FiltroProvisionesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  estado: EstadoProvisionEnum.optional(),
  codPlan: z.string().optional(),
});
export class FiltroProvisionesDto extends createZodDto(FiltroProvisionesSchema) {}
