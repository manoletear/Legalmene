import { eq, inArray } from "drizzle-orm";
import { calcularDv } from "../common/utils/rut";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema";
import { afiliados, planesAfiliado } from "./schema/afiliados";
import { perfiles, usuarios } from "./schema/usuarios";
import { materias, tiposConsulta, tribunales } from "./schema/maestros";
import { atenciones, type NuevaAtencion } from "./schema/atenciones";
import { gestiones } from "./schema/gestiones";
import { provisionMovimientos, provisiones, provisionesEventos } from "./schema/provisiones";

// Casos de demostración para que el dashboard tenga cifras reales (no maqueta).
// Solo corre con SEED_DEMO=true. Idempotente y "rodante": en cada arranque re-ancla las
// fechas a hoy, así consultas del día, SLA y vencimientos siguen teniendo sentido aunque
// la demo se despierte días después. Todo dato es ficticio (RUT de prueba, example.cl).

type Db = NodePgDatabase<typeof schema>;
// Correlativos fijos en un rango alto (900001+) de 2026: formato TIPO-AÑO-NNNNNN sin chocar
// con siguienteCorrelativo(), y estables para que el seed sea idempotente.
const ANIO_DEMO = "2026";
const DIA = 24 * 60 * 60 * 1000;

const rut = (cuerpo: number) => `${cuerpo}-${calcularDv(String(cuerpo))}`;

const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const ABOGADOS = [
  { n: 11, nombre: "Camila Fuentes", anexo: "211" },
  { n: 12, nombre: "Rodrigo Valdés", anexo: "212" },
  { n: 13, nombre: "Francisca Muñoz", anexo: "213" },
  { n: 14, nombre: "Tomás Herrera", anexo: "214" },
];

const PERSONAS: [string, string, string, string][] = [
  ["Ana", "Contreras", "Silva", "DEMO"],
  ["Luis", "Morales", "Díaz", "EMP01"],
  ["Carolina", "Araya", "Pino", "DEMO"],
  ["Jorge", "Castillo", "Reyes", "EMP01"],
  ["Valentina", "Espinoza", "Lagos", "DEMO"],
  ["Matías", "Sepúlveda", "Vera", "EMP01"],
  ["Daniela", "Torres", "Bravo", "DEMO"],
  ["Felipe", "Navarro", "Ortiz", "EMP01"],
  ["Paula", "Vargas", "Cid", "DEMO"],
  ["Ignacio", "Rivera", "Mella", "EMP01"],
  ["Constanza", "Salinas", "Ruiz", "DEMO"],
  ["Sebastián", "Gutiérrez", "Paz", "EMP01"],
];

type Tipo = "Consulta" | "Asesoria" | "Juicio";
interface CasoSeed {
  tipo: Tipo;
  estado: NuevaAtencion["estado"];
  materia: string;
  asunto: string;
  dias: number; // apertura = hoy - dias
  abogado: number | null; // índice en ABOGADOS
  prioridad?: NuevaAtencion["prioridad"];
}

// 32 casos: mezcla de tipos, estados, materias y antigüedad (0–58 días).
const CASOS: CasoSeed[] = [
  { tipo: "Consulta", estado: "Iniciada", materia: "Arrendamiento", asunto: "Arrendatario no paga renta hace 3 meses", dias: 0, abogado: null },
  { tipo: "Consulta", estado: "Iniciada", materia: "Despido injustificado", asunto: "Despido verbal sin carta de aviso", dias: 0, abogado: null, prioridad: "Alta" },
  { tipo: "Consulta", estado: "Respondida", materia: "Pensión de alimentos", asunto: "Aumento de pensión de alimentos", dias: 0, abogado: 0 },
  { tipo: "Consulta", estado: "Iniciada", materia: "Ley del Consumidor", asunto: "Producto defectuoso sin cambio en tienda", dias: 0, abogado: 1 },
  { tipo: "Consulta", estado: "Terminada", materia: "Cobro de prestaciones", asunto: "Finiquito con montos impagos", dias: 1, abogado: 2 },
  { tipo: "Consulta", estado: "Respondida", materia: "Divorcio", asunto: "Requisitos divorcio de común acuerdo", dias: 1, abogado: 0 },
  { tipo: "Consulta", estado: "Iniciada", materia: "Accidente de tránsito", asunto: "Choque por alcance, tercero sin seguro", dias: 1, abogado: null },
  { tipo: "Consulta", estado: "Terminada", materia: "Reclamo tributario", asunto: "Diferencia en devolución de impuestos", dias: 3, abogado: 3 },
  { tipo: "Consulta", estado: "Terminada", materia: "Cuidado personal", asunto: "Régimen de visitas incumplido", dias: 6, abogado: 1 },
  { tipo: "Consulta", estado: "Terminada", materia: "Arrendamiento", asunto: "Devolución de garantía de arriendo", dias: 12, abogado: 2 },
  { tipo: "Consulta", estado: "Terminada", materia: "Tutela laboral", asunto: "Acoso laboral de jefatura directa", dias: 20, abogado: 0 },
  { tipo: "Consulta", estado: "Terminada", materia: "Ley del Consumidor", asunto: "Cobro indebido de tarjeta de crédito", dias: 34, abogado: 3 },
  { tipo: "Asesoria", estado: "Asignada", materia: "Arrendamiento", asunto: "Redacción de contrato de arriendo comercial", dias: 2, abogado: 1 },
  { tipo: "Asesoria", estado: "EnGestion", materia: "Constitución de sociedad", asunto: "Constitución SpA para emprendimiento", dias: 5, abogado: 2 },
  { tipo: "Asesoria", estado: "EnGestion", materia: "Reclamo tributario", asunto: "Respuesta a citación del SII", dias: 9, abogado: 3, prioridad: "Alta" },
  { tipo: "Asesoria", estado: "Pendiente", materia: "Sumario administrativo", asunto: "Defensa en sumario municipal", dias: 14, abogado: 0 },
  { tipo: "Asesoria", estado: "EnEsperaAntecedentes", materia: "Divorcio", asunto: "Acuerdo completo y suficiente", dias: 18, abogado: 1 },
  { tipo: "Asesoria", estado: "EnComite", materia: "Indemnización de perjuicios", asunto: "Evaluar demanda por filtración en departamento", dias: 22, abogado: 2 },
  { tipo: "Asesoria", estado: "Terminada", materia: "Ley del Consumidor", asunto: "Reclamo SERNAC por viaje cancelado", dias: 40, abogado: 3 },
  { tipo: "Asesoria", estado: "Terminada", materia: "Cobro de prestaciones", asunto: "Revisión de finiquito", dias: 52, abogado: 0 },
  { tipo: "Juicio", estado: "Asignada", materia: "Despido injustificado", asunto: "Demanda por despido injustificado", dias: 3, abogado: 0, prioridad: "Alta" },
  { tipo: "Juicio", estado: "EnGestion", materia: "Juicio ejecutivo", asunto: "Cobro de pagaré impago", dias: 8, abogado: 1 },
  { tipo: "Juicio", estado: "EnGestion", materia: "Pensión de alimentos", asunto: "Demanda de alimentos menores", dias: 11, abogado: 2, prioridad: "Urgente" },
  { tipo: "Juicio", estado: "EnGestion", materia: "Tutela laboral", asunto: "Tutela por vulneración de derechos", dias: 16, abogado: 3 },
  { tipo: "Juicio", estado: "EnEsperaProvision", materia: "Querella", asunto: "Querella por estafa en compraventa", dias: 19, abogado: 0 },
  { tipo: "Juicio", estado: "EnEsperaArancel", materia: "Accidente de tránsito", asunto: "Demanda civil por accidente", dias: 24, abogado: 1 },
  { tipo: "Juicio", estado: "Pendiente", materia: "Divorcio", asunto: "Divorcio unilateral por cese de convivencia", dias: 27, abogado: 2 },
  { tipo: "Juicio", estado: "EnComite", materia: "Indemnización de perjuicios", asunto: "Demanda por negligencia médica", dias: 31, abogado: 3, prioridad: "Alta" },
  { tipo: "Juicio", estado: "EnGestion", materia: "Defensa penal", asunto: "Defensa en formalización", dias: 36, abogado: 0, prioridad: "Urgente" },
  { tipo: "Juicio", estado: "Terminada", materia: "Juicio ejecutivo", asunto: "Cobro de cheque protestado", dias: 45, abogado: 1 },
  { tipo: "Juicio", estado: "Terminada", materia: "Cobro de prestaciones", asunto: "Cobro de cotizaciones impagas", dias: 50, abogado: 2 },
  { tipo: "Juicio", estado: "Abandonada", materia: "Arrendamiento", asunto: "Desahucio de arriendo", dias: 58, abogado: 3 },
];

const PREF: Record<Tipo, string> = { Consulta: "CONS", Asesoria: "ASES", Juicio: "JUI" };
const corr = (n: number) => `${PREF[CASOS[n - 1].tipo]}-${ANIO_DEMO}-${900000 + n}`;
const TERMINALES = new Set(["Terminada", "Abandonada", "Derivada"]);

export async function sembrarDemo(db: Db): Promise<void> {
  const ahora = Date.now();
  const hace = (dias: number, horas = 10) => {
    const d = new Date(ahora - dias * DIA);
    // Hora fija (UTC) en el día, salvo hoy: nunca en el futuro.
    d.setUTCHours(horas + 3, 15, 0, 0);
    return d.getTime() > ahora ? new Date(ahora - 30 * 60 * 1000) : d;
  };
  const en = (dias: number) => new Date(ahora + dias * DIA);

  // Abogados demo.
  const [perfilAbogado] = await db.select({ id: perfiles.id }).from(perfiles).where(eq(perfiles.codigo, "ABOGADO"));
  if (!perfilAbogado) throw new Error("Perfil ABOGADO no existe; ejecute las migraciones");
  const [jefe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, "jefatura.judicial@legalchile.cl"));
  await db
    .insert(usuarios)
    .values(
      ABOGADOS.map((a) => ({
        entraOid: `00000000-0000-0000-0000-0000000000${a.n}`,
        // El dashboard muestra al abogado por su email: nombre.apellido@ → "Nombre Apellido".
        email: `${slug(a.nombre).replace(" ", ".")}@legalchile.cl`,
        nombre: a.nombre,
        perfilId: perfilAbogado.id,
        jefeId: jefe?.id ?? null,
        anexo: a.anexo,
      })),
    )
    .onConflictDoNothing();
  const abogados = await db
    .select({ id: usuarios.id, oid: usuarios.entraOid })
    .from(usuarios)
    .where(inArray(usuarios.entraOid, ABOGADOS.map((a) => `00000000-0000-0000-0000-0000000000${a.n}`)));
  const abogadoId = ABOGADOS.map((a) => abogados.find((u) => u.oid.endsWith(String(a.n)))!.id);
  const [admin] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, "admin@legalchile.cl"));

  // Afiliados demo con plan vigente.
  const ruts = PERSONAS.map((_, i) => rut(15_000_000 + i * 123_457));
  await db
    .insert(afiliados)
    .values(
      PERSONAS.map(([nombres, ap, am], i) => ({
        rut: ruts[i],
        nombres,
        apellidoPaterno: ap,
        apellidoMaterno: am,
        email: `${slug(nombres)}.${slug(ap)}@example.cl`,
        comuna: ["Santiago", "Providencia", "Maipú", "La Florida", "Ñuñoa", "Puente Alto"][i % 6],
        region: "Metropolitana",
        metadata: { demo: true },
      })),
    )
    .onConflictDoNothing();
  const filasAfi = await db.select({ id: afiliados.id, rut: afiliados.rut }).from(afiliados).where(inArray(afiliados.rut, ruts));
  const afiId = new Map(filasAfi.map((f) => [f.rut, f.id] as const));
  const yaConPlan = new Set(
    (await db.select({ a: planesAfiliado.afiliadoId }).from(planesAfiliado).where(inArray(planesAfiliado.afiliadoId, [...afiId.values()]))).map((r) => r.a),
  );
  const nuevosPlanes = PERSONAS.map(([, , , plan], i) => ({ afiliadoId: afiId.get(ruts[i])!, codPlan: plan, fechaInicio: "2025-01-01" })).filter(
    (p) => !yaConPlan.has(p.afiliadoId),
  );
  if (nuevosPlanes.length) await db.insert(planesAfiliado).values(nuevosPlanes);

  // Maestros por nombre.
  const mats = await db
    .select({ id: materias.id, nombre: materias.nombre, competenciaId: materias.competenciaId })
    .from(materias);
  const materia = (nombre: string) => {
    const m = mats.find((x) => x.nombre === nombre);
    if (!m) throw new Error(`Materia ${nombre} no existe en el catálogo`);
    return m;
  };
  const [tipoTel] = await db.select({ id: tiposConsulta.id }).from(tiposConsulta).where(eq(tiposConsulta.nombre, "Telefónica"));
  const tribs = await db.select({ id: tribunales.id }).from(tribunales);

  // Atenciones: upsert por correlativo re-anclando fechas y estado a hoy.
  for (const [i, c] of CASOS.entries()) {
    const m = materia(c.materia);
    const apertura = hace(c.dias, 9 + (i % 8));
    const persona = PERSONAS[i % PERSONAS.length];
    const fila: NuevaAtencion = {
      correlativo: corr(i + 1),
      codPlan: persona[3],
      afiliadoId: afiId.get(ruts[i % PERSONAS.length])!,
      tipo: c.tipo,
      estado: c.estado,
      competenciaId: m.competenciaId,
      materiaId: m.id,
      asunto: c.asunto,
      descripcion: "Caso ficticio de demostración.",
      abogadoAsignadoId: c.abogado === null ? null : abogadoId[c.abogado],
      creadoPorId: admin?.id ?? null,
      fechaApertura: apertura,
      fechaCierre: TERMINALES.has(c.estado) ? new Date(Math.min(apertura.getTime() + 5 * DIA, ahora)) : null,
      fechaUltimaGestion: new Date(Math.min(apertura.getTime() + 2 * DIA, ahora)),
      prioridad: c.prioridad ?? "Media",
      canalContacto: c.tipo === "Consulta" ? "Telefonico" : null,
      tipoConsultaId: c.tipo === "Consulta" ? (tipoTel?.id ?? null) : null,
      tribunalId: c.tipo === "Juicio" && tribs.length ? tribs[i % tribs.length].id : null,
      rolCausa: c.tipo === "Juicio" ? `C-${1000 + i * 37}-2026` : null,
      metadata: { demo: true },
      createdAt: apertura,
      updatedAt: new Date(ahora),
    };
    const { correlativo: _c, ...cambios } = fila;
    await db.insert(atenciones).values(fila).onConflictDoUpdate({ target: atenciones.correlativo, set: cambios });
  }

  const demo = await db
    .select({ id: atenciones.id, correlativo: atenciones.correlativo, estado: atenciones.estado, tipo: atenciones.tipo, abogado: atenciones.abogadoAsignadoId })
    .from(atenciones)
    .where(inArray(atenciones.correlativo, CASOS.map((_, i) => corr(i + 1))));
  const ids = demo.map((d) => d.id);
  const porCorr = new Map(demo.map((d) => [d.correlativo, d] as const));
  const caso = (n: number) => porCorr.get(corr(n))!;

  // Gestiones y provisiones demo: se reemplazan completas en cada corrida.
  await db.delete(gestiones).where(inArray(gestiones.atencionId, ids));
  const provDemo = (await db.select({ id: provisiones.id }).from(provisiones).where(inArray(provisiones.atencionId, ids))).map((p) => p.id);
  if (provDemo.length) {
    await db.delete(provisionesEventos).where(inArray(provisionesEventos.provisionId, provDemo));
    await db.delete(provisionMovimientos).where(inArray(provisionMovimientos.provisionId, provDemo));
    await db.delete(provisiones).where(inArray(provisiones.id, provDemo));
  }

  const resp = (n: number) => caso(n).abogado ?? abogadoId[0];
  type G = { n: number; tipo: (typeof gestiones.$inferInsert)["tipo"]; titulo: string; compromiso: number; estado?: "Pendiente" | "Completada" };
  const G_LIST: G[] = [
    // Escritos judiciales por vencer (≤5 días hábiles).
    { n: 21, tipo: "EscritoJudicial", titulo: "Presentar demanda en tribunal laboral", compromiso: 1 },
    { n: 22, tipo: "EscritoJudicial", titulo: "Escrito de téngase presente", compromiso: 2 },
    { n: 23, tipo: "EscritoJudicial", titulo: "Contestar excepciones", compromiso: 3 },
    { n: 24, tipo: "EscritoJudicial", titulo: "Ofrecer prueba testimonial", compromiso: 4 },
    // Por vencer en 3 días (SLA).
    { n: 15, tipo: "AnalisisDocumental", titulo: "Revisar antecedentes de citación SII", compromiso: 1 },
    { n: 29, tipo: "Audiencia", titulo: "Audiencia de formalización", compromiso: 2 },
    { n: 13, tipo: "Reunion", titulo: "Reunión de revisión de contrato", compromiso: 0.5 },
    // Vencidas.
    { n: 16, tipo: "Email", titulo: "Enviar descargos al fiscal instructor", compromiso: -2 },
    { n: 27, tipo: "Notificacion", titulo: "Gestionar notificación personal", compromiso: -4 },
    // Pendientes con más holgura.
    { n: 14, tipo: "AnalisisDocumental", titulo: "Revisar estatutos borrador", compromiso: 9 },
    { n: 17, tipo: "LlamadaTelefonica", titulo: "Solicitar certificado de matrimonio", compromiso: 12 },
    { n: 28, tipo: "EscritoJudicial", titulo: "Preparar informe para comité", compromiso: 15 },
    // Completadas.
    { n: 22, tipo: "EscritoJudicial", titulo: "Presentar demanda ejecutiva", compromiso: -6, estado: "Completada" },
    { n: 23, tipo: "Audiencia", titulo: "Audiencia preparatoria", compromiso: -3, estado: "Completada" },
  ];
  await db.insert(gestiones).values(
    G_LIST.map((g) => ({
      atencionId: caso(g.n).id,
      tipo: g.tipo,
      estado: g.estado ?? "Pendiente",
      titulo: g.titulo,
      responsableId: resp(g.n),
      fechaCompromiso: en(g.compromiso),
      fechaEjecucion: g.estado === "Completada" ? en(g.compromiso) : null,
    })),
  );

  type P = { n: number; monto: number; motivo: string; estado: "Solicitada" | "EnAprobacion" | "Autorizada"; dias: number };
  const P_LIST: P[] = [
    { n: 25, monto: 180_000, motivo: "Receptor judicial y notificaciones", estado: "Solicitada", dias: 2 },
    { n: 26, monto: 95_000, motivo: "Peritaje de daños del vehículo", estado: "EnAprobacion", dias: 4 },
    { n: 28, monto: 450_000, motivo: "Informe pericial médico", estado: "EnAprobacion", dias: 6 },
    { n: 22, monto: 60_000, motivo: "Gastos de embargo", estado: "Autorizada", dias: 7 },
  ];
  await db.insert(provisiones).values(
    P_LIST.map((p) => ({
      atencionId: caso(p.n).id,
      monto: p.monto,
      motivo: p.motivo,
      estado: p.estado,
      solicitadaPorId: resp(p.n),
      fechaSolicitud: hace(p.dias),
      ...(p.estado === "Autorizada" ? { resueltaPorId: admin?.id ?? resp(p.n), fechaResolucion: hace(p.dias - 1) } : {}),
    })),
  );

  console.info(`Demo: ${demo.length} atenciones, ${G_LIST.length} gestiones, ${P_LIST.length} provisiones (fechas re-ancladas a hoy).`);
}
