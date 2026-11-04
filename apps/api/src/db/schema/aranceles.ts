import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { planes } from "./planes";
import { competenciaEnum, tipoAtencionEnum } from "./enums";

// valorUfCentesimas = UF × 100 (2,5 UF → 250) para mantener montos enteros.
export const aranceles = pgTable(
  "aranceles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    codigo: varchar("codigo", { length: 30 }).notNull(),
    descripcion: varchar("descripcion", { length: 250 }).notNull(),
    competencia: competenciaEnum("competencia").notNull(),
    tipo: tipoAtencionEnum("tipo"),
    valorUfCentesimas: integer("valor_uf_centesimas").notNull(),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planCodigoUq: uniqueIndex("aranceles_plan_codigo_uq").on(t.codPlan, t.codigo),
    planCompetenciaIdx: index("aranceles_plan_competencia_idx").on(t.codPlan, t.competencia),
  }),
);

export type Arancel = typeof aranceles.$inferSelect;
export type NuevoArancel = typeof aranceles.$inferInsert;

// Valor diario de la UF en centavos de peso (39.123,45 → 3912345).
export const valoresUf = pgTable("valores_uf", {
  fecha: date("fecha", { mode: "string" }).primaryKey(),
  valorCentavos: integer("valor_centavos").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ValorUf = typeof valoresUf.$inferSelect;
