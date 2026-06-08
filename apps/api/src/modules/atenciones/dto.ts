import { CreateAtencionSchema, UpdateAtencionSchema, DerivarAtencionSchema } from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class CreateAtencionDto extends createZodDto(CreateAtencionSchema) {}
export class UpdateAtencionDto extends createZodDto(UpdateAtencionSchema) {}
export class DerivarAtencionDto extends createZodDto(DerivarAtencionSchema) {}

export const FiltroAtencionesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  estado: z
    .enum(["Abierta", "EnGestion", "EnComite", "Suspendida", "Cerrada", "Archivada"])
    .optional(),
  tipo: z.enum(["Consulta", "Asesoria", "Juicio"]).optional(),
  abogadoId: z.string().uuid().optional(),
  afiliadoId: z.string().uuid().optional(),
  correlativo: z.string().optional(),
  // Búsqueda full-text en materia/descripcion/correlativo/competencia.
  q: z.string().min(2).optional(),
});
export class FiltroAtencionesDto extends createZodDto(FiltroAtencionesSchema) {}
