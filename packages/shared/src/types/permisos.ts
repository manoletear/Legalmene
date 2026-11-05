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
      "atenciones.editar": "Editar atenciones y contrapartes",
      "atenciones.cambiar_estado": "Cambiar estado de atenciones",
      "atenciones.revisar_comite": "Marcar 'Revisado por comité'",
      "derivaciones.solicitar": "Solicitar derivaciones",
      "derivaciones.aprobar": "Aprobar o rechazar derivaciones",
      "gestiones.registrar": "Registrar y completar gestiones",
      "comites.convocar": "Convocar y cerrar comités",
      "comites.votar": "Votar en comités",
      "documentos.subir": "Subir documentos",
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
      "exportar.datos": "Exportar datos a planilla",
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
];

const JEFATURA: Permiso[] = [
  ...OPERACION_ATENCION,
  "atenciones.ver_equipo",
  "atenciones.revisar_comite",
  "derivaciones.aprobar",
  "comites.convocar",
  "aranceles_atencion.aprobar",
  "provisiones.autorizar",
  "afiliados.crear",
  "afiliados.editar",
  "reportes.ver",
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
    permisos: [...JEFATURA.filter((p) => p !== "atenciones.ver_equipo"), "atenciones.ver_todas", "finanzas.ver", "pagos.ver", "webhooks.ver", "aranceles.administrar", "cargas.ejecutar"],
  },
  { codigo: "JEFATURA_CONSULTAS", nombre: "Jefatura Consultas", descripcion: "Jefatura del área consultas: ve y aprueba lo de su equipo.", permisos: JEFATURA },
  { codigo: "JEFATURA_JUDICIAL", nombre: "Jefatura Judicial", descripcion: "Jefatura del área judicial: ve y aprueba lo de su equipo.", permisos: JEFATURA },
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
      "atenciones.editar",
      "atenciones.cambiar_estado",
      "derivaciones.solicitar",
      "gestiones.registrar",
      "documentos.subir",
      "pagos.ver",
      "pagos.iniciar",
    ],
  },
  {
    codigo: "GERENCIA_FINANZAS",
    nombre: "Gerencia de Finanzas",
    descripcion: "Ejecutivo y gerencia de finanzas: dispone, entrega y devuelve fondos.",
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

export const PerfilSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  vigente: z.boolean(),
  esSistema: z.boolean(),
  permisos: z.array(PermisoEnum),
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
});
export type UpdatePerfil = z.infer<typeof UpdatePerfilSchema>;
