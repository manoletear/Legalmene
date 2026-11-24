import { pgTable, uuid, varchar, timestamp, pgEnum, index, jsonb } from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";

export const estadoCorreoEnum = pgEnum("estado_correo", ["Enviado", "Omitido", "Error"]);

// Bitácora de correos enviados por el sistema (Anexo §I l.66, §VI–X): qué plantilla, a quién y
// con qué resultado. "Omitido" = SES desactivado (desarrollo o demo). No guarda el cuerpo.
export const correosEnviados = pgTable(
  "correos_enviados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id").references(() => atenciones.id, { onDelete: "set null" }),
    plantilla: varchar("plantilla", { length: 60 }).notNull(),
    destinatarios: jsonb("destinatarios").$type<string[]>().notNull(),
    asunto: varchar("asunto", { length: 300 }).notNull(),
    estado: estadoCorreoEnum("estado").notNull(),
    enviadoPorId: uuid("enviado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ atencionIdx: index("correos_enviados_atencion_idx").on(t.atencionId, t.createdAt) }),
);
export type CorreoEnviadoRow = typeof correosEnviados.$inferSelect;
