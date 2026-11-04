import { pgEnum } from "drizzle-orm/pg-core";

export const tipoAtencionEnum = pgEnum("tipo_atencion", ["Consulta", "Asesoria", "Juicio"]);
export const competenciaEnum = pgEnum("competencia", [
  "Civil",
  "Penal",
  "Laboral",
  "Familia",
  "Tributario",
  "Comercial",
  "Administrativo",
  "Constitucional",
  "Otro",
]);
