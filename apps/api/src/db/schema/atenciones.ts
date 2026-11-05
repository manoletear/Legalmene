import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  integer,
  boolean,
  smallint,
} from "drizzle-orm/pg-core";
import { planes } from "./planes";
import { afiliados } from "./afiliados";
import { usuarios } from "./usuarios";
import {
  calidadesProcesales,
  causasTermino,
  competencias,
  materias,
  organismos,
  procedimientos,
  tiposConsulta,
  tribunales,
} from "./maestros";
import { tipoAtencionEnum } from "./enums";

export { tipoAtencionEnum };
// Estados del Anexo PSL; cada tipo usa un subconjunto (ver estados-atencion.ts en shared).
export const estadoAtencionEnum = pgEnum("estado_atencion", [
  "Iniciada",
  "Respondida",
  "Derivada",
  "Asignada",
  "Pendiente",
  "EnGestion",
  "EnEsperaAntecedentes",
  "EnEsperaArancel",
  "EnEsperaProvision",
  "EnComite",
  "Terminada",
  "Abandonada",
]);
export const canalContactoEnum = pgEnum("canal_contacto", [
  "Telefonico",
  "Presencial",
  "Email",
  "Chat",
  "Videoconferencia",
]);
export const monedaCuantiaEnum = pgEnum("moneda_cuantia", ["CLP", "UF", "UTM", "USD"]);
export const prioridadEnum = pgEnum("prioridad", ["Baja", "Media", "Alta", "Urgente"]);

export const atenciones = pgTable(
  "atenciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Correlativo legible al usuario, único global: ej. "CONS-2026-000123".
    correlativo: varchar("correlativo", { length: 32 }).notNull(),
    // Plan bajo el cual se prestó la atención (vigente del RUT, o REZAGADO/METLIFE).
    codPlan: varchar("cod_plan", { length: 20 })
      .notNull()
      .references(() => planes.codPlan, { onDelete: "restrict" }),
    afiliadoId: uuid("afiliado_id")
      .notNull()
      .references(() => afiliados.id, { onDelete: "restrict" }),
    tipo: tipoAtencionEnum("tipo").notNull(),
    estado: estadoAtencionEnum("estado").notNull(),
    competenciaId: uuid("competencia_id")
      .notNull()
      .references(() => competencias.id, { onDelete: "restrict" }),
    materiaId: uuid("materia_id")
      .notNull()
      .references(() => materias.id, { onDelete: "restrict" }),
    // Línea de asunto del caso (texto libre). La materia es el maestro.
    asunto: varchar("asunto", { length: 250 }).notNull(),
    descripcion: text("descripcion"),
    abogadoAsignadoId: uuid("abogado_asignado_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    // Quién registró la atención: también la ve aunque no sea el abogado asignado.
    creadoPorId: uuid("creado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    fechaApertura: timestamp("fecha_apertura", { withTimezone: true }).notNull().defaultNow(),
    fechaCierre: timestamp("fecha_cierre", { withTimezone: true }),
    fechaUltimaGestion: timestamp("fecha_ultima_gestion", { withTimezone: true }),
    prioridad: prioridadEnum("prioridad").notNull().default("Media"),
    origen: varchar("origen", { length: 80 }),
    // Consultas (Anexo §VI).
    canalContacto: canalContactoEnum("canal_contacto"),
    tipoConsultaId: uuid("tipo_consulta_id").references(() => tiposConsulta.id, { onDelete: "restrict" }),
    codigoGrabacion: varchar("codigo_grabacion", { length: 120 }),
    horaInicio: timestamp("hora_inicio", { withTimezone: true }),
    horaTermino: timestamp("hora_termino", { withTimezone: true }),
    respuesta: text("respuesta"),
    // Asesorías y juicios (Anexo §VII–VIII). fechaCierre es la fecha de término.
    organismoId: uuid("organismo_id").references(() => organismos.id, { onDelete: "restrict" }),
    procedimientoId: uuid("procedimiento_id").references(() => procedimientos.id, { onDelete: "restrict" }),
    tribunalId: uuid("tribunal_id").references(() => tribunales.id, { onDelete: "restrict" }),
    rolCausa: varchar("rol_causa", { length: 60 }),
    ruc: varchar("ruc", { length: 60 }),
    // Unidad mínima de la moneda: CLP pesos; UF y UTM centésimas; USD centavos.
    cuantiaMonto: integer("cuantia_monto"),
    cuantiaMoneda: monedaCuantiaEnum("cuantia_moneda"),
    calidadProcesalId: uuid("calidad_procesal_id").references(() => calidadesProcesales.id, {
      onDelete: "restrict",
    }),
    riesgoMateria: smallint("riesgo_materia"),
    riesgoCuantia: smallint("riesgo_cuantia"),
    riesgoCliente: smallint("riesgo_cliente"),
    revisadoPorComite: boolean("revisado_por_comite").notNull().default(false),
    causaTerminoId: uuid("causa_termino_id").references(() => causasTermino.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    correlativoUq: uniqueIndex("atenciones_correlativo_uq").on(t.correlativo),
    planEstadoIdx: index("atenciones_plan_estado_idx").on(t.codPlan, t.estado),
    afiliadoIdx: index("atenciones_afiliado_idx").on(t.afiliadoId),
    abogadoIdx: index("atenciones_abogado_idx").on(t.abogadoAsignadoId),
    tipoFechaIdx: index("atenciones_tipo_fecha_idx").on(t.tipo, t.fechaApertura),
    materiaIdx: index("atenciones_materia_idx").on(t.materiaId),
  }),
);

export type Atencion = typeof atenciones.$inferSelect;

export const estadoDerivacionEnum = pgEnum("estado_derivacion", ["Solicitada", "Aprobada", "Rechazada"]);

export const derivaciones = pgTable(
  "derivaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consultaId: uuid("consulta_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "restrict" }),
    nuevoTipo: tipoAtencionEnum("nuevo_tipo").notNull(),
    motivo: text("motivo").notNull(),
    estado: estadoDerivacionEnum("estado").notNull().default("Solicitada"),
    solicitadaPorId: uuid("solicitada_por_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    resueltaPorId: uuid("resuelta_por_id").references(() => usuarios.id, { onDelete: "restrict" }),
    observacion: text("observacion"),
    atencionDerivadaId: uuid("atencion_derivada_id").references(() => atenciones.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resueltaAt: timestamp("resuelta_at", { withTimezone: true }),
  },
  (t) => ({
    consultaIdx: index("derivaciones_consulta_idx").on(t.consultaId),
    estadoIdx: index("derivaciones_estado_idx").on(t.estado),
  }),
);
export type Derivacion = typeof derivaciones.$inferSelect;

export const contrapartes = pgTable(
  "contrapartes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atencionId: uuid("atencion_id")
      .notNull()
      .references(() => atenciones.id, { onDelete: "restrict" }),
    nombre: varchar("nombre", { length: 200 }).notNull(),
    rut: varchar("rut", { length: 12 }),
    representanteLegal: varchar("representante_legal", { length: 200 }),
    abogadoNombre: varchar("abogado_nombre", { length: 200 }),
    abogadoEmail: varchar("abogado_email", { length: 200 }),
    abogadoTelefono: varchar("abogado_telefono", { length: 30 }),
    vigente: boolean("vigente").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ atencionIdx: index("contrapartes_atencion_idx").on(t.atencionId) }),
);
export type ContraparteRow = typeof contrapartes.$inferSelect;
export type NuevaAtencion = typeof atenciones.$inferInsert;

// Tabla de secuencias para generar correlativos atómicos por tipo/año.
export const correlativos = pgTable(
  "correlativos",
  {
    tipo: tipoAtencionEnum("tipo").notNull(),
    anio: varchar("anio", { length: 4 }).notNull(),
    valor: jsonb("valor").$type<{ next: number }>().notNull().default({ next: 1 }),
  },
  (t) => ({
    pk: uniqueIndex("correlativos_tipo_anio_uq").on(t.tipo, t.anio),
  }),
);
