import { CreateArancelSchema, UpdateArancelSchema, ValorUfSchema, CompetenciaEnum } from "@legalmene/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class CreateArancelDto extends createZodDto(CreateArancelSchema) {}
export class UpdateArancelDto extends createZodDto(UpdateArancelSchema) {}
export class ValorUfDto extends createZodDto(ValorUfSchema) {}

export const FiltroArancelesSchema = z.object({
  competencia: CompetenciaEnum.optional(),
  soloVigentes: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export class FiltroArancelesDto extends createZodDto(FiltroArancelesSchema) {}
