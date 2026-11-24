import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { usuarios } from "./usuarios";

// Notas internas de la atención (Anexo §IV l.382). No se editan ni se borran (trazabilidad).
export const notasAtencion = pgTable(
  "notas_atencion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "cascade" }),
    texto: text("texto").notNull(),
    autorId: uuid("autor_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    destinatarioId: uuid("destinatario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ atencionIdx: index("notas_atencion_atencion_idx").on(t.atencionId, t.createdAt) }),
);
