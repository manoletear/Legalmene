import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { atenciones as atencionesTabla } from "../../src/db/schema/atenciones";
import { usuarios } from "../../src/db/schema/usuarios";
import { GestionesService } from "../../src/modules/gestiones/gestiones.service";
import { PlazosService } from "../../src/modules/atenciones/plazos.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { DerivacionesService } from "../../src/modules/atenciones/derivaciones.service";
import { gestiones, gestionesPlantilla } from "../../src/db/schema/gestiones";
import { causasTermino, tribunales } from "../../src/db/schema/maestros";
import { materias } from "../../src/db/schema/maestros";
import { eq } from "drizzle-orm";
import {
  borrarAtencionesDePlan,
  borrarMateriaDePrueba,
  materiaDePrueba,
  planAleatorio,
  rutAleatorio,
  usuarioDePrueba,
  type MateriaPrueba,
} from "./helpers";

const RUN = !!process.env.DATABASE_URL;

const numero = (correlativo: string) => parseInt(correlativo.split("-")[2], 10);

const avisos: { titulo: string; metadata?: Record<string, unknown> }[] = [];

(RUN ? describe : describe.skip)("AtencionesService (integration)", () => {
  let moduleRef: TestingModule;
  let atenciones: AtencionesService;
  let afiliadosSrv: AfiliadosService;
  let pool: Pool;
  const TEST_PLAN = planAleatorio();
  let afiliadoId: string;
  let cm: MateriaPrueba;
  let derivacionesSrv: DerivacionesService;
  let abogado: { id: string; permisos: readonly string[] };
  let jefe: { id: string; permisos: readonly string[] };
  let causaId: string;
  let tribunalId: string;

  const base = () => ({ afiliadoId, codPlan: TEST_PLAN });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        PlantillasService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        DerivacionesService,
        GestionesService,
        PlazosService,
        // Stub: el test no verifica entrega real de webhooks; basta con la
        // promesa resolviendo para no romper la pipeline.
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        // Stub NotifInbox para no crear filas; firmas usadas: crear, crearSiNoExisteUnseen.
        {
          provide: NotifInboxService,
          useValue: {
            crear: async () => null,
            crearSiNoExisteUnseen: async (input: { titulo: string; metadata?: Record<string, unknown> }) => {
              avisos.push(input);
              return null;
            },
            crearBulk: async () => [],
          },
        },
      ],
    }).compile();
    atenciones = moduleRef.get(AtencionesService);
    afiliadosSrv = moduleRef.get(AfiliadosService);
    derivacionesSrv = moduleRef.get(DerivacionesService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: TEST_PLAN, nombre: `Test ${TEST_PLAN}` }).onConflictDoNothing();
    cm = await materiaDePrueba(db);

    const afi = await afiliadosSrv.crear({
      rut: rutAleatorio(),
      nombres: "Test",
      apellidoPaterno: "Atenciones",
    });
    afiliadoId = afi.id;
    await afiliadosSrv.asignarPlan(afiliadoId, { codPlan: TEST_PLAN, fechaInicio: "2024-01-01" });
    const ua = await usuarioDePrueba(db, "ABOGADO");
    const uj = await usuarioDePrueba(db, "GERENCIA_SERVICIOS");
    abogado = { id: ua.id, permisos: ua.permisos };
    jefe = { id: uj.id, permisos: uj.permisos };
    const [c] = await db.insert(causasTermino).values({ nombre: `Causa ${TEST_PLAN}` }).returning();
    const [t] = await db.insert(tribunales).values({ nombre: `Tribunal ${TEST_PLAN}` }).returning();
    causaId = c.id;
    tribunalId = t.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await borrarAtencionesDePlan(db, TEST_PLAN);
    await db.execute(sql`DELETE FROM causas_termino WHERE id = ${causaId}`);
    await db.execute(sql`DELETE FROM tribunales WHERE id = ${tribunalId}`);
    await db.execute(sql`DELETE FROM usuarios WHERE id IN (${abogado.id}, ${jefe.id})`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${TEST_PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("genera correlativo con formato TIPO-AÑO-NNNNNN y estado inicial por tipo", async () => {
    const a = await atenciones.crear({
      ...base(),
      tipo: "Consulta",
      ...cm,
      asunto: "Test correlativo",
    });
    expect(a.correlativo).toMatch(/^CONS-\d{4}-\d{6}$/);
    expect(a.estado).toBe("Iniciada");
    expect(a.horaInicio).toBeTruthy();
    expect(a.codPlan).toBe(TEST_PLAN);
    const j = await atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Inicial juicio" });
    expect(j.estado).toBe("Asignada");
  });

  it("incrementa el correlativo global por tipo", async () => {
    const c1 = await atenciones.crear({ ...base(), tipo: "Consulta", ...cm, asunto: "Test 1" });
    const c2 = await atenciones.crear({ ...base(), tipo: "Consulta", ...cm, asunto: "Test 2" });
    expect(numero(c2.correlativo)).toBeGreaterThan(numero(c1.correlativo));

    const j1 = await atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Test juicio" });
    expect(j1.correlativo).toMatch(/^JUIC-\d{4}-\d{6}$/);
  });

  it("correlativos son únicos bajo concurrencia (20 inserts paralelos)", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        atenciones.crear({ ...base(), tipo: "Asesoria", ...cm, asunto: "Concurrencia" }),
      ),
    );
    const correlativos = results.map((r) => r.correlativo);
    expect(new Set(correlativos).size).toBe(20);
    for (const c of correlativos) {
      expect(c).toMatch(/^ASES-\d{4}-\d{6}$/);
    }
  });

  it("derivación: se solicita, la jefatura aprueba y nace un juicio Asignado", async () => {
    const consulta = await atenciones.crear({ ...base(), tipo: "Consulta", ...cm, asunto: "A derivar", descripcion: "Original" }, abogado);
    const d = await derivacionesSrv.solicitar(consulta.id, abogado.id, { nuevoTipo: "Juicio", motivo: "Requiere demanda" });
    expect(d.estado).toBe("Solicitada");
    await expect(
      derivacionesSrv.solicitar(consulta.id, abogado.id, { nuevoTipo: "Juicio", motivo: "Otra vez" }),
    ).rejects.toThrow(/pendiente/);

    const { derivacion, atencion } = await derivacionesSrv.aprobar(d.id, jefe, { abogadoDestinoId: abogado.id });
    expect(derivacion.estado).toBe("Aprobada");
    expect(atencion.tipo).toBe("Juicio");
    expect(atencion.estado).toBe("Asignada");
    expect(atencion.codPlan).toBe(TEST_PLAN);
    expect(atencion.materiaId).toBe(consulta.materiaId);
    expect((atencion.metadata as { derivadaDe?: string })?.derivadaDe).toBe(consulta.id);
    expect((await atenciones.obtener(consulta.id)).estado).toBe("Derivada");
    await expect(derivacionesSrv.aprobar(d.id, jefe, {})).rejects.toThrow(/ya fue resuelta/);
  });

  it("derivación rechazada deja la consulta igual; materia que no aplica exige elegir otra", async () => {
    const consulta = await atenciones.crear({ ...base(), tipo: "Consulta", ...cm, asunto: "Rechazo" });
    const d1 = await derivacionesSrv.solicitar(consulta.id, abogado.id, { nuevoTipo: "Asesoria", motivo: "Evaluar asesoría" });
    const r = await derivacionesSrv.rechazar(d1.id, jefe, { observacion: "Se resolvió en consulta" });
    expect(r.estado).toBe("Rechazada");
    expect((await atenciones.obtener(consulta.id)).estado).toBe("Iniciada");

    const db = drizzle(pool);
    await db.update(materias).set({ aplicaJuicio: false }).where(eq(materias.id, cm.materiaId));
    try {
      const d2 = await derivacionesSrv.solicitar(consulta.id, abogado.id, { nuevoTipo: "Juicio", motivo: "Ahora juicio" });
      await expect(derivacionesSrv.aprobar(d2.id, jefe, {})).rejects.toThrow(/Elija otra materia/);
    } finally {
      await db.update(materias).set({ aplicaJuicio: true }).where(eq(materias.id, cm.materiaId));
    }
  });

  it("juicio: Pendiente exige tribunal, ROL y cuantía", async () => {
    const j = await atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Etapas" });
    await expect(atenciones.cambiarEstado(j.id, { estado: "Pendiente" })).rejects.toThrow(
      /Falta: tribunal; ROL\/RIT de la causa; cuantía y moneda/,
    );
    await atenciones.actualizar(j.id, { tribunalId, rolCausa: "C-123-2026", cuantiaMonto: 500_000, cuantiaMoneda: "CLP" }, abogado);
    const p = await atenciones.cambiarEstado(j.id, { estado: "Pendiente" });
    expect(p.estado).toBe("Pendiente");
  });

  it("no se termina con gestiones pendientes; sí con causa y gestiones completadas", async () => {
    const a = await atenciones.crear({ ...base(), tipo: "Asesoria", ...cm, asunto: "Cierre" });
    await atenciones.cambiarEstado(a.id, { estado: "Pendiente" });
    const db = drizzle(pool);
    const [g] = await db
      .insert(gestiones)
      .values({ atencionId: a.id, tipo: "Otra", titulo: "Pendiente", responsableId: abogado.id })
      .returning();
    // Terminar exige el V°B° de jefatura: no se puede pasar a Terminada directamente.
    await expect(atenciones.cambiarEstado(a.id, { estado: "Terminada", causaTerminoId: causaId }, abogado)).rejects.toThrow(/V°B°/);
    // La solicitud se valida al pedirla: con gestiones pendientes no se acepta.
    await expect(atenciones.solicitarTermino(a.id, { causaTerminoId: causaId }, abogado)).rejects.toThrow(/1 gestión\(es\) pendiente/);
    await db.update(gestiones).set({ estado: "Completada" }).where(eq(gestiones.id, g.id));
    const s = await atenciones.solicitarTermino(a.id, { causaTerminoId: causaId, observacion: "Asesoría entregada" }, abogado);
    expect(s.solicitudTermino).toMatchObject({ solicitadoPorId: abogado.id, causaTerminoId: causaId });
    await expect(atenciones.solicitarTermino(a.id, { causaTerminoId: causaId }, abogado)).rejects.toBeInstanceOf(ConflictException);
    // Cuatro ojos: quien solicita no da el V°B°.
    await expect(atenciones.aprobarTermino(a.id, abogado)).rejects.toThrow(/no puede darle el V°B°/);
    const t = await atenciones.aprobarTermino(a.id, jefe);
    expect(t).toMatchObject({ estado: "Terminada", solicitudTermino: null, causaTerminoId: causaId });
    expect(t.fechaCierre).toBeTruthy();
    expect((t.metadata as { vistoBuenoTermino?: { porId: string } }).vistoBuenoTermino?.porId).toBe(jefe.id);
  });

  it("V°B° rechazado: la solicitud se limpia y el abogado puede volver a pedirla", async () => {
    const j = await atenciones.crear({ ...base(), tipo: "Asesoria", ...cm, asunto: "Rechazo VB" });
    await atenciones.cambiarEstado(j.id, { estado: "Pendiente" });
    await atenciones.solicitarTermino(j.id, { causaTerminoId: causaId }, abogado);
    await expect(atenciones.rechazarTermino(j.id, "x", abogado)).rejects.toThrow(/no puede rechazarlo/);
    const r = await atenciones.rechazarTermino(j.id, "Falta entregar documentos al cliente", jefe);
    expect(r).toMatchObject({ estado: "Pendiente", solicitudTermino: null });
    await expect(atenciones.rechazarTermino(j.id, "otra vez", jefe)).rejects.toBeInstanceOf(ConflictException);
    // Una consulta no usa V°B°.
    const c = await atenciones.crear({ ...base(), tipo: "Consulta", ...cm, asunto: "Consulta" });
    await expect(atenciones.solicitarTermino(c.id, { causaTerminoId: causaId }, abogado)).rejects.toThrow(/Solo asesorías y juicios/);
  });

  it("abandonar con riesgo ≥ 20 exige revisión de comité, que solo marca la jefatura", async () => {
    const j = await atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Riesgo" });
    await atenciones.actualizar(j.id, { riesgoMateria: 10, riesgoCuantia: 6, riesgoCliente: 4 }, abogado);
    await expect(atenciones.cambiarEstado(j.id, { estado: "Abandonada", causaTerminoId: causaId })).rejects.toThrow(
      /revisión de comité/,
    );
    await expect(atenciones.actualizar(j.id, { revisadoPorComite: true }, abogado)).rejects.toThrow(/Revisado por comité/);
    await atenciones.actualizar(j.id, { revisadoPorComite: true }, jefe);
    const ab = await atenciones.cambiarEstado(j.id, { estado: "Abandonada", causaTerminoId: causaId });
    expect(ab.estado).toBe("Abandonada");
  });

  it("gestiones: responsable activo, fechas coherentes y se completan una sola vez con fecha real", async () => {
    const gestionesSrv = moduleRef.get(GestionesService);
    const db = drizzle(pool);
    const a = await atenciones.crear({ ...base(), tipo: "Asesoria", ...cm, asunto: "Gestiones" });
    const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
    const inactivo = await usuarioDePrueba(db, "ABOGADO");
    try {
      await db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, inactivo.id));
      const base0 = { atencionId: a.id, tipo: "Reunion" as const, titulo: "Entrevista", documentosIds: [] };
      await expect(gestionesSrv.crear({ ...base0, responsableId: inactivo.id })).rejects.toThrow(/no está activo/);
      await expect(
        gestionesSrv.crear({ ...base0, responsableId: abogado.id, fechaProgramada: dias(-2), fechaCompromiso: dias(-5) }),
      ).rejects.toThrow(/anterior a la de inicio/);
      const g = await gestionesSrv.crear({ ...base0, responsableId: abogado.id, fechaProgramada: dias(-5), fechaCompromiso: dias(3) });

      await expect(gestionesSrv.completar(g.id, { resultado: "x", fechaEjecucion: dias(2) })).rejects.toThrow(/futura/);
      await expect(gestionesSrv.completar(g.id, { resultado: "x", fechaEjecucion: dias(-6) })).rejects.toThrow(/anterior a la de inicio/);
      const real = dias(-1);
      const c = await gestionesSrv.completar(g.id, { resultado: "Entrevista realizada", fechaEjecucion: real });
      expect(c).toMatchObject({ estado: "Completada", resultado: "Entrevista realizada" });
      expect(c.fechaEjecucion?.toISOString()).toBe(real);
      // Una segunda vez no reescribe el resultado ni la fecha.
      await expect(gestionesSrv.completar(g.id, { resultado: "Otro" })).rejects.toBeInstanceOf(ConflictException);
    } finally {
      await db.execute(sql`DELETE FROM usuarios WHERE id = ${inactivo.id}`);
    }
  });

  it("plazos: contacto con el cliente se cumple al completar una llamada y avisa los vencidos", async () => {
    const plazosSrv = moduleRef.get(PlazosService);
    const gestionesSrv = moduleRef.get(GestionesService);
    const db = drizzle(pool);
    const a = await atenciones.crear({ ...base(), tipo: "Asesoria", ...cm, asunto: "Plazos", abogadoAsignadoId: abogado.id });
    const [contacto] = await plazosSrv.deAtencion(a.id);
    expect(contacto).toMatchObject({ tipo: "ContactoCliente", estado: "Pendiente", cumplidoEn: null });

    // Abierta hace 10 días y sin contacto: vencido y avisado al abogado (una vez).
    await db.update(atencionesTabla).set({ createdAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(atencionesTabla.id, a.id));
    expect((await plazosSrv.deAtencion(a.id))[0].estado).toBe("Vencido");
    avisos.length = 0;
    await plazosSrv.avisarVencidos();
    expect(avisos.filter((x) => x.metadata?.plazoVencido === `${a.id}:ContactoCliente:`)).toHaveLength(1);

    // Una llamada realizada cuenta como primer contacto (fuera de plazo).
    const g = await gestionesSrv.crear({ atencionId: a.id, tipo: "LlamadaTelefonica", titulo: "Llamada", responsableId: abogado.id, documentosIds: [] });
    await gestionesSrv.completar(g.id, { resultado: "Contactado" });
    expect((await plazosSrv.deAtencion(a.id))[0].estado).toBe("CumplidoFueraDePlazo");
    // Registrar un contacto anterior lo adelanta (nunca lo atrasa).
    const antes = new Date(Date.now() - 9.5 * 86_400_000).toISOString();
    expect((await plazosSrv.registrarContacto(a.id, antes))[0].cumplidoEn).toBe(antes);
    expect((await plazosSrv.registrarContacto(a.id))[0].cumplidoEn).toBe(antes);
  });

  it("el abogado asignado al crear o reasignar debe existir y estar activo", async () => {
    const db = drizzle(pool);
    const inactivo = await usuarioDePrueba(db, "ABOGADO");
    try {
      await db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, inactivo.id));
      await expect(
        atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Asignación", abogadoAsignadoId: inactivo.id }),
      ).rejects.toThrow(/no está activo/);
      await expect(
        atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Asignación", abogadoAsignadoId: "00000000-0000-4000-8000-000000000000" }),
      ).rejects.toThrow(/no existe/);
      const ok = await atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Asignación", abogadoAsignadoId: abogado.id });
      expect(ok.abogadoAsignadoId).toBe(abogado.id);
      await expect(atenciones.actualizar(ok.id, { abogadoAsignadoId: inactivo.id }, jefe)).rejects.toThrow(/no está activo/);
    } finally {
      await db.execute(sql`DELETE FROM usuarios WHERE id = ${inactivo.id}`);
    }
  });

  it("asesorías y juicios guardan código de grabación; la fecha real de término se valida", async () => {
    const j = await atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "Fecha término", codigoGrabacion: "GRAB-J-1" });
    expect(j.codigoGrabacion).toBe("GRAB-J-1");
    expect((await atenciones.actualizar(j.id, { codigoGrabacion: "GRAB-J-2" }, abogado)).codigoGrabacion).toBe("GRAB-J-2");
    const db = drizzle(pool);
    const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
    await db.update(atencionesTabla).set({ createdAt: hace(10) }).where(eq(atencionesTabla.id, j.id));

    const futura = new Date(Date.now() + 86_400_000).toISOString();
    await expect(atenciones.cambiarEstado(j.id, { estado: "Abandonada", causaTerminoId: causaId, fechaTermino: futura })).rejects.toThrow(/futura/);
    await expect(
      atenciones.cambiarEstado(j.id, { estado: "Abandonada", causaTerminoId: causaId, fechaTermino: hace(20).toISOString() }),
    ).rejects.toThrow(/anterior a la apertura/);
    const real = hace(3);
    const ab = await atenciones.cambiarEstado(j.id, { estado: "Abandonada", causaTerminoId: causaId, fechaTermino: real.toISOString() });
    expect(ab.fechaCierre?.toISOString()).toBe(real.toISOString());
  });

  it("instancia las gestiones predefinidas de la materia con plazo en días hábiles", async () => {
    const db = drizzle(pool);
    await db.insert(gestionesPlantilla).values([
      { materiaId: cm.materiaId, orden: 1, titulo: "Primera gestión", tipo: "LlamadaTelefonica", plazoDiasHabiles: 1 },
      { materiaId: cm.materiaId, orden: 2, titulo: "Segunda gestión", tipo: "EscritoJudicial", plazoDiasHabiles: 5 },
    ]);
    const a = await atenciones.crear({ ...base(), tipo: "Asesoria", ...cm, asunto: "Plantillas" }, abogado);
    const gs = await db.select().from(gestiones).where(eq(gestiones.atencionId, a.id));
    expect(gs.map((g) => g.titulo).sort()).toEqual(["Primera gestión", "Segunda gestión"]);
    expect(gs.every((g) => g.estado === "Pendiente" && g.responsableId === abogado.id && g.fechaCompromiso)).toBe(true);
    const consulta = await atenciones.crear({ ...base(), tipo: "Consulta", ...cm, asunto: "Sin plantillas" }, abogado);
    expect(await db.select().from(gestiones).where(eq(gestiones.atencionId, consulta.id))).toHaveLength(0);
  });

  it("nuevo correlativo copia afiliado, plan, canal y grabación", async () => {
    const c = await atenciones.crear({
      ...base(),
      tipo: "Consulta",
      ...cm,
      asunto: "Llamada",
      canalContacto: "Telefonico",
      codigoGrabacion: "GRAB-001",
    });
    const otra = await atenciones.nuevoCorrelativo(c.id, { ...cm, asunto: "Segunda consulta" });
    expect(otra.correlativo).not.toBe(c.correlativo);
    expect(otra.codigoGrabacion).toBe("GRAB-001");
    expect(otra.canalContacto).toBe("Telefonico");
    const resp = await atenciones.cambiarEstado(c.id, { estado: "Respondida" });
    expect(resp.horaTermino).toBeTruthy();
  });

  it("filtra búsqueda por plan", async () => {
    const res = await atenciones.buscar({ page: 1, pageSize: 200, codPlan: TEST_PLAN });
    expect(res.total).toBeGreaterThan(0);
    expect(res.data.every((a) => a.codPlan === TEST_PLAN)).toBe(true);
  });
});
