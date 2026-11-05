import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
  uniqueIndex,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { tipoAtencionEnum } from "./enums";
import { materias } from "./maestros";
import { planes } from "./planes";

// Arancel por materia (Anexo §IX), común a todos los planes. tipo null = cualquier tipo.
// valorUfCentesimas = UF × 100 (2,5 UF → 250) para mantener montos enteros.
export const aranceles = pgTable(
  "aranceles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materiaId: uuid("materia_id")
      .notNull()
      .references(() => materias.id, { onDelete: "restrict" }),
    tipo: tipoAtencionEnum("tipo"),
    codigo: varchar("codigo", { length: 30 }).notNull(),
    descripcion: varchar("descripcion", { length: 250 }).notNull(),
    valorUfCentesimas: integer("valor_uf_centesimas").notNull(),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codigoUq: uniqueIndex("aranceles_codigo_uq").on(t.codigo),
    // NULLS NOT DISTINCT: un solo arancel "para cualquier tipo" (tipo NULL) por materia.
    materiaTipoUq: unique("aranceles_materia_tipo_uq").on(t.materiaId, t.tipo).nullsNotDistinct(),
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

export const modalidadCoberturaEnum = pgEnum("modalidad_cobertura", ["Porcentaje", "ValorUF", "SinCobertura"]);

// Cobertura del plan sobre el arancel. materia/tipo null = regla por defecto del plan.
export const coberturas = pgTable(
  "coberturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    materiaId: uuid("materia_id").references(() => materias.id, { onDelete: "restrict" }),
    tipo: tipoAtencionEnum("tipo"),
    modalidad: modalidadCoberturaEnum("modalidad").notNull(),
    porcentaje: integer("porcentaje"),
    valorUfCentesimas: integer("valor_uf_centesimas"),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reglaUq: unique("coberturas_regla_uq").on(t.codPlan, t.materiaId, t.tipo).nullsNotDistinct(),
    planIdx: index("coberturas_plan_idx").on(t.codPlan),
  }),
);

export type CoberturaRow = typeof coberturas.$inferSelect;
