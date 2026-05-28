import { pgTable, uuid, varchar, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const rolUsuarioEnum = pgEnum("rol_usuario", [
  "Administrador",
  "Supervisor",
  "Abogado",
  "Operador",
  "Auditor",
]);

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  entraOid: varchar("entra_oid", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 200 }).notNull().unique(),
  nombre: varchar("nombre", { length: 200 }).notNull(),
  rol: rolUsuarioEnum("rol").notNull(),
  codPlanes: jsonb("cod_planes").$type<string[]>().notNull().default([]),
  activo: boolean("activo").notNull().default(true),
  ultimoLogin: timestamp("ultimo_login", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;
