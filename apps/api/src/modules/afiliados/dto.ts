import {
  AsignarPlanSchema,
  CreateAfiliadoSchema,
  TerminarPlanSchema,
  UpdateAfiliadoSchema,
} from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class CreateAfiliadoDto extends createZodDto(CreateAfiliadoSchema) {}
export class UpdateAfiliadoDto extends createZodDto(UpdateAfiliadoSchema) {}
export class AsignarPlanDto extends createZodDto(AsignarPlanSchema) {}
export class TerminarPlanDto extends createZodDto(TerminarPlanSchema) {}

export const FiltroAfiliadosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().optional(), // texto libre (rut, nombre, email)
  vigencia: z.enum(["Activo", "Inactivo", "Eliminado"]).optional(),
  codPlan: z.string().optional(),
  canalId: z.string().uuid().optional(),
  rut: z.string().trim().min(1).optional(),
});
export class FiltroAfiliadosDto extends createZodDto(FiltroAfiliadosSchema) {}
