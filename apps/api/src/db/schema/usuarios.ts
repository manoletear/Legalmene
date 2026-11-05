import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  primaryKey,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Perfiles del Anexo §IV como datos: el administrador define qué permisos tiene cada uno.
export const perfiles = pgTable("perfiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: varchar("codigo", { length: 40 }).notNull().unique(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  descripcion: text("descripcion"),
  vigente: boolean("vigente").notNull().default(true),
  // Perfiles del organigrama: editables pero no eliminables.
  esSistema: boolean("es_sistema").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PerfilRow = typeof perfiles.$inferSelect;

export const perfilPermisos = pgTable(
  "perfil_permisos",
  {
    perfilId: uuid("perfil_id")
      .notNull()
      .references(() => perfiles.id, { onDelete: "cascade" }),
    // Clave del catálogo PERMISOS (packages/shared/src/types/permisos.ts).
    permiso: varchar("permiso", { length: 80 }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.perfilId, t.permiso] }),
  }),
);

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entraOid: varchar("entra_oid", { length: 128 }).notNull().unique(),
    email: varchar("email", { length: 200 }).notNull().unique(),
    nombre: varchar("nombre", { length: 200 }).notNull(),
    perfilId: uuid("perfil_id")
      .notNull()
      .references(() => perfiles.id, { onDelete: "restrict" }),
    // Jefatura directa (Anexo §IV: "el perfilamiento considera la relación con su jefatura").
    jefeId: uuid("jefe_id").references((): AnyPgColumn => usuarios.id, { onDelete: "set null" }),
    // Anexo telefónico: llave para buscar las grabaciones del día.
    anexo: varchar("anexo", { length: 10 }),
    activo: boolean("activo").notNull().default(true),
    bloqueado: boolean("bloqueado").notNull().default(false),
    motivoBloqueo: text("motivo_bloqueo"),
    ultimoLogin: timestamp("ultimo_login", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    perfilIdx: index("usuarios_perfil_idx").on(t.perfilId),
    jefeIdx: index("usuarios_jefe_idx").on(t.jefeId),
  }),
);

export type Usuario = typeof usuarios.$inferSelect;
export type NuevoUsuario = typeof usuarios.$inferInsert;

// Enlaces de acceso ("magic link"): solo se guarda el hash SHA-256 del token, que es de un
// solo uso y vence a los pocos minutos. La fila queda como registro del intento de ingreso.
export const enlacesAcceso = pgTable(
  "enlaces_acceso",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
    usadoEn: timestamp("usado_en", { withTimezone: true }),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    usuarioIdx: index("enlaces_acceso_usuario_idx").on(t.usuarioId, t.createdAt),
  }),
);
