import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";

// Metadatos de archivos; el blob vive en S3 (s3Key apunta al object).
export const documentos = pgTable(
  "documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id").references(() => atenciones.id, { onDelete: "set null" }),
    nombre: varchar("nombre", { length: 250 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    tamanoBytes: integer("tamano_bytes").notNull(),
    s3Bucket: varchar("s3_bucket", { length: 120 }).notNull(),
    s3Key: varchar("s3_key", { length: 500 }).notNull(),
    s3VersionId: varchar("s3_version_id", { length: 120 }),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    subidoPor: uuid("subido_por")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    fechaSubida: timestamp("fecha_subida", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    atencionIdx: index("documentos_atencion_idx").on(t.atencionId),
    shaIdx: index("documentos_sha_idx").on(t.sha256),
  }),
);

export type Documento = typeof documentos.$inferSelect;
export type NuevoDocumento = typeof documentos.$inferInsert;
