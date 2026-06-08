import { CreateAfiliadoSchema, UpdateAfiliadoSchema } from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class CreateAfiliadoDto extends createZodDto(CreateAfiliadoSchema) {}
export class UpdateAfiliadoDto extends createZodDto(UpdateAfiliadoSchema) {}

export const FiltroAfiliadosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().optional(), // texto libre (rut, nombre, email)
  vigencia: z.enum(["Activo", "Inactivo", "Eliminado"]).optional(),
});
export class FiltroAfiliadosDto extends createZodDto(FiltroAfiliadosSchema) {}
