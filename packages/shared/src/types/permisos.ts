import { z } from "zod";

// Catálogo de permisos (Anexo §IV): las claves son del código; los perfiles que las
// agrupan son datos administrables. Cada endpoint protegido usa exactamente una clave.
export const MODULOS_PERMISOS = [
  {
    modulo: "Atenciones",
    permisos: {
      "atenciones.ver_todas": "Ver todas las atenciones",
      "atenciones.ver_equipo": "Ver atenciones de su equipo",
      "atenciones.crear_consulta": "Registrar consultas",
      "atenciones.crear_caso": "Crear asesorías y juicios",
      "posesiones.crear": "Crear posesiones efectivas y editar causante y herederos",
      "atenciones.editar": "Editar atenciones y contrapartes",
      "atenciones.cambiar_estado": "Cambiar estado de atenciones",
      "atenciones.revisar_comite": "Marcar 'Revisado por comité'",
      "atenciones.aprobar_termino": "Dar V°B° al término de asesorías y juicios",
      "atenciones.autorizar_sin_cobertura": "Autorizar atenciones sin cobertura del plan",
      "derivaciones.solicitar": "Solicitar derivaciones",
      "derivaciones.aprobar": "Aprobar o rechazar derivaciones",
      "gestiones.registrar": "Registrar y completar gestiones",
      "comites.convocar": "Convocar y cerrar comités",
      "comites.votar": "Votar en comités",
      "documentos.subir": "Subir documentos",
    },
  },
  {
    modulo: "Agenda",
    permisos: {
      "agenda.ver": "Ver la agenda (propia, de su equipo o de todos según su alcance de atenciones)",
      "agenda.gestionar": "Agendar, reprogramar y cancelar citas",
      "agenda.calendario_audiencias": "Recibir el aviso de audiencias y comparendos para el calendario mensual",
    },
  },
  {
    modulo: "Afiliados y planes",
    permisos: {
      "afiliados.ver": "Ver afiliados y vigencias",
      "afiliados.crear": "Registrar afiliados",
      "afiliados.editar": "Editar afiliados",
      "afiliados.eliminar": "Eliminar afiliados",
      "afiliados.asignar_planes": "Asignar y terminar planes de un afiliado",
      "planes.administrar": "Administrar planes",
      "coberturas.administrar": "Administrar coberturas",
      "cargas.ejecutar": "Ejecutar cargas masivas",
    },
  },
  {
    modulo: "Finanzas",
    permisos: {
      "finanzas.ver": "Ver bandeja de finanzas",
      "aranceles.administrar": "Administrar matriz de aranceles",
      "valores_uf.registrar": "Registrar valor UF",
      "aranceles_atencion.enviar": "Enviar arancel a aprobación",
      "aranceles_atencion.aprobar": "Aprobar o rechazar aranceles",
      "aranceles_atencion.registrar_pago": "Registrar pago de aranceles",
      "provisiones.solicitar": "Solicitar provisiones y entregas",
      "provisiones.registrar_pago": "Registrar pago de provisiones",
      "provisiones.autorizar": "Autorizar o rechazar entregas",
      "provisiones.disponer_entregar": "Disponer, entregar y devolver fondos",
      "provisiones.registrar_movimientos": "Registrar gastos y reintegros",
      "provisiones.rendir": "Rendir provisiones",
      "pagos.ver": "Ver pagos WebPay",
      "pagos.iniciar": "Iniciar pagos WebPay",
      "pagos.confirmar": "Confirmar pagos manualmente",
    },
  },
  {
    modulo: "Reportes",
    permisos: {
      "reportes.ver": "Ver reportes",
      "controller.ver": "Ver carga de trabajo por usuario (controller)",
      "exportar.datos": "Exportar datos a planilla",
      "exportar.formatos": "Definir los formatos (columnas) de las exportaciones",
    },
  },
  {
    modulo: "Administración",
    permisos: {
      "maestros.administrar": "Administrar maestros y gestiones predefinidas",
      "usuarios.administrar": "Administrar usuarios",
      "perfiles.administrar": "Administrar perfiles y permisos",
      "auditoria.ver": "Ver auditoría",
      "auditoria.archivar": "Archivar auditoría",
      "webhooks.ver": "Ver webhooks y entregas",
      "webhooks.administrar": "Administrar webhooks",
      "busqueda.administrar": "Ver el estado del buscador de texto completo y reindexarlo",
      "flujos.corregir": "Corregir registros y retroceder flujos (reabrir atenciones, reiniciar derivaciones, retroceder aranceles y provisiones)",
    },
  },
] as const;

type Modulos = (typeof MODULOS_PERMISOS)[number]["permisos"];
type UnionKeys<T> = T extends unknown ? keyof T : never;
export type Permiso = Extract<UnionKeys<Modulos>, string>;

export const PERMISOS: Permiso[] = MODULOS_PERMISOS.flatMap((m) => Object.keys(m.permisos) as Permiso[]);
export const PermisoEnum = z.enum(PERMISOS as [Permiso, ...Permiso[]]);

export function etiquetaPermiso(p: Permiso): string {
  for (const m of MODULOS_PERMISOS) {
    const e = (m.permisos as Record<string, string>)[p];
    if (e) return e;
  }
  return p;
}

// El perfil ADMIN tiene siempre todos los permisos (incluidos los que se agreguen después):
// así nunca puede quedar sin acceso a usuarios y perfiles.
export const PERFIL_ADMIN = "ADMIN";
// Perfil que recibe un usuario nuevo de Entra ID hasta que el administrador le asigne otro.
export const PERFIL_POR_DEFECTO = "ADMINISTRATIVO";

export function permisosDePerfil(codigo: string, asignados: readonly string[]): Permiso[] {
  if (codigo === PERFIL_ADMIN) return [...PERMISOS];
  const validos = new Set<string>(PERMISOS);
  return asignados.filter((p): p is Permiso => validos.has(p));
}

// Alcance de lectura de atenciones según permisos (Anexo §IV: el abogado ve solo las suyas,
// la jefatura las de su equipo).
export type AlcanceAtenciones = "todas" | "equipo" | "propias";
export function alcanceAtenciones(permisos: Iterable<string>): AlcanceAtenciones {
  const s = new Set(permisos);
  if (s.has("atenciones.ver_todas")) return "todas";
  if (s.has("atenciones.ver_equipo")) return "equipo";
  return "propias";
}

const OPERACION_ATENCION: Permiso[] = [
  "afiliados.ver",
  "atenciones.crear_consulta",
  "atenciones.crear_caso",
  "posesiones.crear",
  "atenciones.editar",
  "atenciones.cambiar_estado",
  "derivaciones.solicitar",
  "gestiones.registrar",
  "comites.votar",
  "documentos.subir",
  "aranceles_atencion.enviar",
  "provisiones.solicitar",
  "provisiones.registrar_movimientos",
  "provisiones.rendir",
  "agenda.ver",
  "agenda.gestionar",
  // Solo lectura de aranceles y pagos WebPay de sus atenciones (Anexo §XI l.1967, l.2001).
  "finanzas.ver",
  "pagos.ver",
];

const JEFATURA: Permiso[] = [
  ...OPERACION_ATENCION,
  "atenciones.ver_equipo",
  "atenciones.revisar_comite",
  "atenciones.aprobar_termino",
  "derivaciones.aprobar",
  "comites.convocar",
  "aranceles_atencion.aprobar",
  "provisiones.autorizar",
  "afiliados.crear",
  "afiliados.editar",
  "reportes.ver",
  "controller.ver",
  "exportar.datos",
];

const CONTABLE: Permiso[] = [
  "afiliados.ver",
  "atenciones.ver_todas",
  "finanzas.ver",
  "pagos.ver",
  "aranceles_atencion.registrar_pago",
  "provisiones.registrar_pago",
  "provisiones.registrar_movimientos",
];

export interface PerfilSistema {
  codigo: string;
  nombre: string;
  descripcion: string;
  permisos: Permiso[];
}

// Perfiles del organigrama del Anexo §IV. Son editables por el administrador (salvo ADMIN,
// que siempre tiene todo) pero no se pueden eliminar.
export const PERFILES_SISTEMA: PerfilSistema[] = [
  { codigo: PERFIL_ADMIN, nombre: "Administrador del sistema", descripcion: "Acceso total a tablas, usuarios y perfiles.", permisos: [...PERMISOS] },
  {
    codigo: "GERENCIA_SERVICIOS",
    nombre: "Gerencia de Servicios",
    descripcion: "Ve todas las atenciones, aprueba flujos y accede a informes.",
    permisos: [...JEFATURA.filter((p) => p !== "atenciones.ver_equipo"), "atenciones.ver_todas", "agenda.calendario_audiencias", "atenciones.autorizar_sin_cobertura", "finanzas.ver", "pagos.ver", "webhooks.ver", "aranceles.administrar", "cargas.ejecutar"],
  },
  { codigo: "JEFATURA_CONSULTAS", nombre: "Jefatura Consultas", descripcion: "Jefatura del área consultas: ve y aprueba lo de su equipo.", permisos: JEFATURA },
  { codigo: "JEFATURA_JUDICIAL", nombre: "Jefatura Judicial", descripcion: "Jefatura del área judicial: ve y aprueba lo de su equipo.", permisos: [...JEFATURA, "agenda.calendario_audiencias"] },
  { codigo: "JEFATURA_FRAUDE", nombre: "Jefatura Fraude", descripcion: "Jefatura del área fraude: ve y aprueba lo de su equipo.", permisos: JEFATURA },
  { codigo: "ABOGADO", nombre: "Abogado", descripcion: "Atiende y gestiona solo sus atenciones.", permisos: OPERACION_ATENCION },
  {
    codigo: "TRAMITADOR",
    nombre: "Procurador / Tramitador / Asistente",
    descripcion: "Registra gestiones y documentos, crea atenciones y las asigna al abogado.",
    permisos: [
      "afiliados.ver",
      "afiliados.crear",
      "atenciones.crear_consulta",
      "atenciones.crear_caso",
      "posesiones.crear",
      "atenciones.editar",
      "atenciones.cambiar_estado",
      "derivaciones.solicitar",
      "gestiones.registrar",
      "documentos.subir",
      "pagos.ver",
      "pagos.iniciar",
      "agenda.ver",
      "agenda.gestionar",
    ],
  },
  {
    codigo: "EJECUTIVO_FINANZAS",
    nombre: "Ejecutivo de Finanzas",
    descripcion: "Gira y entrega fondos a los abogados y emite el cheque de devolución al cliente (EF).",
    permisos: ["afiliados.ver", "atenciones.ver_todas", "finanzas.ver", "pagos.ver", "provisiones.disponer_entregar"],
  },
  {
    codigo: "GERENCIA_FINANZAS",
    nombre: "Gerencia de Finanzas",
    descripcion: "Gerencia de administración y finanzas: controla ingresos de provisiones, devoluciones a clientes, aranceles y UF (GAF).",
    permisos: [...CONTABLE, "provisiones.disponer_entregar", "valores_uf.registrar", "aranceles.administrar", "pagos.iniciar", "reportes.ver", "exportar.datos"],
  },
  { codigo: "CONTADOR", nombre: "Contador", descripcion: "Ejecutivo contable: registra pagos de aranceles y provisiones.", permisos: CONTABLE },
  { codigo: "ASISTENTE_CONTABLE", nombre: "Asistente Contable", descripcion: "Apoya al contador en aranceles y provisiones.", permisos: CONTABLE },
  {
    codigo: "COMERCIAL",
    nombre: "Comercial",
    descripcion: "Consulta vigencias, atenciones por RUT y reportes.",
    permisos: ["afiliados.ver", "atenciones.ver_todas", "reportes.ver", "exportar.datos"],
  },
  { codigo: PERFIL_POR_DEFECTO, nombre: "Administrativo", descripcion: "Consulta vigencias y atenciones por RUT.", permisos: ["afiliados.ver", "atenciones.ver_todas"] },
  {
    codigo: "AUDITOR",
    nombre: "Auditor",
    descripcion: "Lectura de atenciones, reportes y auditoría.",
    permisos: ["afiliados.ver", "atenciones.ver_todas", "reportes.ver", "exportar.datos", "auditoria.ver", "webhooks.ver"],
  },
];

// Horario de acceso del perfil (Anexo §II l.150). Días 1 = lunes … 7 = domingo; horas de Chile.
// null = sin restricción. El perfil Administrador nunca se restringe.
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:MM");
export const HorarioPerfilSchema = z
  .object({ dias: z.array(z.number().int().min(1).max(7)).min(1).max(7), desde: hora, hasta: hora })
  .refine((h) => h.desde < h.hasta, { message: "La hora de inicio debe ser anterior a la de término", path: ["hasta"] });
export type HorarioPerfil = z.infer<typeof HorarioPerfilSchema>;

// ¿El instante cae dentro del horario? (se evalúa en hora de Chile)
export function dentroDeHorario(h: HorarioPerfil | null | undefined, ahora: Date = new Date()): boolean {
  if (!h) return true;
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(ahora);
  const dia = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(partes.find((p) => p.type === "weekday")?.value ?? "") + 1;
  const hh = (partes.find((p) => p.type === "hour")?.value ?? "00").replace("24", "00");
  const mm = partes.find((p) => p.type === "minute")?.value ?? "00";
  const t = `${hh}:${mm}`;
  return h.dias.includes(dia) && t >= h.desde && t < h.hasta;
}

export const PerfilSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  vigente: z.boolean(),
  esSistema: z.boolean(),
  permisos: z.array(PermisoEnum),
  horario: HorarioPerfilSchema.nullable().optional(),
  usuarios: z.number().int().optional(),
});
export type Perfil = z.infer<typeof PerfilSchema>;

export const CreatePerfilSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Use mayúsculas, números y guion bajo"),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(500).optional().nullable(),
  permisos: z.array(PermisoEnum).default([]),
  // Crear como copia de otro perfil (sus permisos se usan si no se envían permisos).
  copiarDe: z.string().uuid().optional(),
});
export type CreatePerfil = z.infer<typeof CreatePerfilSchema>;

export const UpdatePerfilSchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  descripcion: z.string().trim().max(500).optional().nullable(),
  vigente: z.boolean().optional(),
  permisos: z.array(PermisoEnum).optional(),
  horario: HorarioPerfilSchema.nullable().optional(),
});
export type UpdatePerfil = z.infer<typeof UpdatePerfilSchema>;
