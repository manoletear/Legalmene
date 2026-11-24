import { pgTable, uuid, varchar, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { atenciones } from "./atenciones";
import { afiliados } from "./afiliados";
import { usuarios } from "./usuarios";

export const tipoCitaEnum = pgEnum("tipo_cita", ["Entrevista", "Videollamada", "Reunion", "Audiencia", "Comparendo", "Otro"]);
export const estadoCitaEnum = pgEnum("estado_cita", ["Programada", "Realizada", "Cancelada"]);

// Agenda de citas (Anexo §IV l.358, §VI l.662, §VIII l.1130). Cancelar no borra la cita.
export const citas = pgTable(
  "citas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: tipoCitaEnum("tipo").notNull(),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fin: timestamp("fin", { withTimezone: true }).notNull(),
    lugar: varchar("lugar", { length: 300 }),
    estado: estadoCitaEnum("estado").notNull().default("Programada"),
    notas: text("notas"),
    responsableId: uuid("responsable_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    atencionId: uuid("atencion_id").references(() => atenciones.id, { onDelete: "cascade" }),
    afiliadoId: uuid("afiliado_id").references(() => afiliados.id, { onDelete: "restrict" }),
    creadoPorId: uuid("creado_por_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    responsableInicioIdx: index("citas_responsable_inicio_idx").on(t.responsableId, t.inicio),
    atencionIdx: index("citas_atencion_idx").on(t.atencionId),
    inicioIdx: index("citas_inicio_idx").on(t.inicio),
  }),
);
export type CitaRow = typeof citas.$inferSelect;
