import { pgEnum } from "drizzle-orm/pg-core";

export const tipoAtencionEnum = pgEnum("tipo_atencion", ["Consulta", "Asesoria", "Juicio", "PosesionEfectiva"]);
