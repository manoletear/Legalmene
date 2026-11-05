import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { TipoAtencion } from "@legalmene/shared";
import {
  calidadesProcesales,
  causasTermino,
  competencias,
  materias,
  organismos,
  procedimientos,
  tiposConsulta,
  tribunales,
} from "./schema/maestros";
import { aranceles, coberturas } from "./schema/aranceles";
import { gestionesPlantilla } from "./schema/gestiones";
import type { TipoGestion } from "@legalmene/shared";

// Catálogo de ejemplo para el ambiente demo. Idempotente: claves naturales + ON CONFLICT.
// Los valores en UF son referenciales para la demo, no la matriz real de LegalChile.

interface MateriaSeed {
  nombre: string;
  consulta?: boolean;
  asesoria?: boolean;
  juicio?: boolean;
  provision?: boolean;
}

const MATERIAS: Record<string, MateriaSeed[]> = {
  Civil: [
    { nombre: "Juicio ejecutivo", consulta: true, asesoria: false, juicio: true, provision: true },
    { nombre: "Arrendamiento" },
    { nombre: "Indemnización de perjuicios", provision: true },
  ],
  Laboral: [
    { nombre: "Despido injustificado", provision: true },
    { nombre: "Tutela laboral", provision: true },
    { nombre: "Cobro de prestaciones" },
  ],
  Familia: [
    { nombre: "Pensión de alimentos" },
    { nombre: "Divorcio", provision: true },
    { nombre: "Cuidado personal" },
  ],
  Penal: [{ nombre: "Querella", provision: true }, { nombre: "Defensa penal", provision: true }],
  Tributario: [{ nombre: "Reclamo tributario", consulta: true, asesoria: true, juicio: true }],
  Comercial: [{ nombre: "Constitución de sociedad", juicio: false }],
  Administrativo: [{ nombre: "Sumario administrativo" }],
  Constitucional: [{ nombre: "Recurso de protección", asesoria: false }],
  "Policía Local": [{ nombre: "Ley del Consumidor" }, { nombre: "Accidente de tránsito", provision: true }],
};

const PROCEDIMIENTOS: Record<string, string[]> = {
  Civil: ["Juicio ordinario", "Juicio ejecutivo", "Juicio sumario"],
  Laboral: ["Procedimiento de aplicación general", "Procedimiento monitorio", "Tutela de derechos fundamentales"],
  Familia: ["Procedimiento ordinario de familia"],
  "Policía Local": ["Procedimiento de Policía Local"],
};

const TRIBUNALES = [
  { nombre: "1° Juzgado de Letras del Trabajo de Santiago", region: "Metropolitana", comuna: "Santiago" },
  { nombre: "2° Juzgado Civil de Santiago", region: "Metropolitana", comuna: "Santiago" },
  { nombre: "1° Juzgado de Familia de Santiago", region: "Metropolitana", comuna: "Santiago" },
  { nombre: "Juzgado de Policía Local de Providencia", region: "Metropolitana", comuna: "Providencia" },
  { nombre: "2° Juzgado de Policía Local de La Serena", region: "Coquimbo", comuna: "La Serena" },
];

const SIMPLES = {
  organismos: ["No interviene organismo", "Inspección del Trabajo", "SERNAC", "Servicio de Impuestos Internos", "Registro Civil e Identificación", "Conservador de Bienes Raíces"],
  // Anexo §VI.2: el tipo de consulta es el medio de contacto.
  tiposConsulta: ["Telefónica", "Entrevista personal", "Correo electrónico", "Chat", "Videoconferencia"],
  causasTermino: ["Consulta resuelta", "Sentencia favorable", "Sentencia desfavorable", "Avenimiento", "Desistimiento", "Abandono del procedimiento", "Cliente no paga arancel"],
  calidadesProcesales: ["Demandante", "Demandado", "Querellante", "Querellado", "Denunciante", "Tercero"],
};

interface ArancelSeed {
  competencia: string;
  materia: string;
  tipo: TipoAtencion | null;
  codigo: string;
  descripcion: string;
  uf: number;
}

const ARANCELES: ArancelSeed[] = [
  { competencia: "Laboral", materia: "Despido injustificado", tipo: "Juicio", codigo: "A-LAB-01", descripcion: "Juicio por despido injustificado", uf: 12 },
  { competencia: "Laboral", materia: "Tutela laboral", tipo: "Asesoria", codigo: "A-LAB-02", descripcion: "Asesoría en tutela laboral", uf: 4 },
  { competencia: "Laboral", materia: "Cobro de prestaciones", tipo: null, codigo: "A-LAB-03", descripcion: "Cobro de prestaciones laborales", uf: 6 },
  { competencia: "Familia", materia: "Pensión de alimentos", tipo: null, codigo: "A-FAM-01", descripcion: "Demanda de alimentos", uf: 8 },
  { competencia: "Familia", materia: "Divorcio", tipo: "Juicio", codigo: "A-FAM-02", descripcion: "Divorcio", uf: 15 },
  { competencia: "Familia", materia: "Cuidado personal", tipo: "Juicio", codigo: "A-FAM-03", descripcion: "Demanda de cuidado personal", uf: 10 },
  { competencia: "Civil", materia: "Juicio ejecutivo", tipo: "Juicio", codigo: "A-CIV-01", descripcion: "Juicio ejecutivo de cobro", uf: 15 },
  { competencia: "Civil", materia: "Arrendamiento", tipo: null, codigo: "A-CIV-02", descripcion: "Término de arrendamiento", uf: 9 },
  { competencia: "Civil", materia: "Indemnización de perjuicios", tipo: "Juicio", codigo: "A-CIV-03", descripcion: "Demanda de indemnización de perjuicios", uf: 20 },
  { competencia: "Policía Local", materia: "Ley del Consumidor", tipo: null, codigo: "A-PLO-01", descripcion: "Denuncia Ley del Consumidor", uf: 5 },
  { competencia: "Policía Local", materia: "Accidente de tránsito", tipo: "Juicio", codigo: "A-PLO-02", descripcion: "Juicio por accidente de tránsito", uf: 7 },
];

interface CoberturaSeed {
  codPlan: string;
  materia?: [string, string];
  tipo?: TipoAtencion;
  modalidad: "Porcentaje" | "ValorUF" | "SinCobertura";
  porcentaje?: number;
  uf?: number;
}

const COBERTURAS: CoberturaSeed[] = [
  { codPlan: "DEMO", modalidad: "Porcentaje", porcentaje: 50 },
  { codPlan: "DEMO", tipo: "Consulta", modalidad: "Porcentaje", porcentaje: 100 },
  { codPlan: "DEMO", materia: ["Laboral", "Despido injustificado"], tipo: "Juicio", modalidad: "Porcentaje", porcentaje: 80 },
  { codPlan: "DEMO", materia: ["Policía Local", "Ley del Consumidor"], modalidad: "ValorUF", uf: 1 },
  { codPlan: "EMP01", modalidad: "Porcentaje", porcentaje: 70 },
  { codPlan: "EMP01", tipo: "Consulta", modalidad: "Porcentaje", porcentaje: 100 },
  { codPlan: "EMP01", materia: ["Familia", "Divorcio"], modalidad: "SinCobertura" },
  { codPlan: "REZAGADO", modalidad: "SinCobertura" },
  { codPlan: "METLIFE", modalidad: "SinCobertura" },
];

interface PlantillaSeed {
  materia?: [string, string];
  procedimiento?: [string, string];
  orden: number;
  titulo: string;
  tipo: TipoGestion;
  plazo: number;
}

// Gestiones estándar por materia/procedimiento (Anexo §XIV: orden y plazo de cumplimiento).
const PLANTILLAS: PlantillaSeed[] = [
  { materia: ["Laboral", "Despido injustificado"], orden: 1, titulo: "Contactar al cliente y solicitar antecedentes", tipo: "LlamadaTelefonica", plazo: 1 },
  { materia: ["Laboral", "Despido injustificado"], orden: 2, titulo: "Revisar carta de despido y finiquito", tipo: "AnalisisDocumental", plazo: 3 },
  { materia: ["Laboral", "Despido injustificado"], orden: 3, titulo: "Redactar y presentar demanda", tipo: "EscritoJudicial", plazo: 5 },
  { materia: ["Familia", "Pensión de alimentos"], orden: 1, titulo: "Entrevista con el cliente", tipo: "Reunion", plazo: 2 },
  { materia: ["Familia", "Pensión de alimentos"], orden: 2, titulo: "Solicitar mediación obligatoria", tipo: "Otra", plazo: 5 },
  { materia: ["Civil", "Arrendamiento"], orden: 1, titulo: "Revisar contrato de arriendo", tipo: "AnalisisDocumental", plazo: 2 },
  { procedimiento: ["Laboral", "Procedimiento de aplicación general"], orden: 10, titulo: "Preparar audiencia preparatoria", tipo: "Audiencia", plazo: 15 },
  { procedimiento: ["Laboral", "Procedimiento de aplicación general"], orden: 11, titulo: "Preparar audiencia de juicio", tipo: "Audiencia", plazo: 30 },
  { procedimiento: ["Civil", "Juicio ejecutivo"], orden: 10, titulo: "Requerimiento de pago y embargo", tipo: "Notificacion", plazo: 10 },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sembrarCatalogo(db: NodePgDatabase<any>): Promise<void> {
  await db
    .insert(competencias)
    .values(Object.keys(MATERIAS).map((nombre) => ({ nombre })))
    .onConflictDoNothing();
  const comp = new Map((await db.select().from(competencias)).map((c) => [c.nombre, c.id] as const));

  await db
    .insert(materias)
    .values(
      Object.entries(MATERIAS).flatMap(([c, lista]) =>
        lista.map((m) => ({
          competenciaId: comp.get(c)!,
          nombre: m.nombre,
          aplicaConsulta: m.consulta ?? true,
          aplicaAsesoria: m.asesoria ?? true,
          aplicaJuicio: m.juicio ?? true,
          requiereProvision: m.provision ?? false,
        })),
      ),
    )
    .onConflictDoNothing();
  const mat = new Map(
    (await db.select().from(materias)).map((m) => [`${m.competenciaId}|${m.nombre}`, m.id] as const),
  );
  const materiaId = (c: string, m: string) => mat.get(`${comp.get(c)}|${m}`)!;

  await db
    .insert(procedimientos)
    .values(
      Object.entries(PROCEDIMIENTOS).flatMap(([c, lista]) =>
        lista.map((nombre) => ({ competenciaId: comp.get(c)!, nombre })),
      ),
    )
    .onConflictDoNothing();
  await db.insert(tribunales).values(TRIBUNALES).onConflictDoNothing();
  await db.insert(organismos).values(SIMPLES.organismos.map((nombre) => ({ nombre }))).onConflictDoNothing();
  await db.insert(tiposConsulta).values(SIMPLES.tiposConsulta.map((nombre) => ({ nombre }))).onConflictDoNothing();
  await db.insert(causasTermino).values(SIMPLES.causasTermino.map((nombre) => ({ nombre }))).onConflictDoNothing();
  await db
    .insert(calidadesProcesales)
    .values(SIMPLES.calidadesProcesales.map((nombre) => ({ nombre })))
    .onConflictDoNothing();

  await db
    .insert(aranceles)
    .values(
      ARANCELES.map((a) => ({
        materiaId: materiaId(a.competencia, a.materia),
        tipo: a.tipo,
        codigo: a.codigo,
        descripcion: a.descripcion,
        valorUfCentesimas: Math.round(a.uf * 100),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(coberturas)
    .values(
      COBERTURAS.map((c) => ({
        codPlan: c.codPlan,
        materiaId: c.materia ? materiaId(c.materia[0], c.materia[1]) : null,
        tipo: c.tipo ?? null,
        modalidad: c.modalidad,
        porcentaje: c.porcentaje ?? null,
        valorUfCentesimas: c.uf === undefined ? null : Math.round(c.uf * 100),
      })),
    )
    .onConflictDoNothing();

  // Sin clave natural: se siembran solo si la tabla está vacía.
  const [hayPlantillas] = await db.select({ id: gestionesPlantilla.id }).from(gestionesPlantilla).limit(1);
  if (!hayPlantillas) {
    const proc = new Map(
      (await db.select().from(procedimientos)).map((p) => [`${p.competenciaId}|${p.nombre}`, p.id] as const),
    );
    await db.insert(gestionesPlantilla).values(
      PLANTILLAS.map((p) => ({
        materiaId: p.materia ? materiaId(p.materia[0], p.materia[1]) : null,
        procedimientoId: p.procedimiento ? proc.get(`${comp.get(p.procedimiento[0])}|${p.procedimiento[1]}`)! : null,
        orden: p.orden,
        titulo: p.titulo,
        tipo: p.tipo,
        plazoDiasHabiles: p.plazo,
      })),
    );
  }
}
