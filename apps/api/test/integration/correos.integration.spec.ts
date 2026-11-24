import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { GestionesService } from "../../src/modules/gestiones/gestiones.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { NotificacionesService, type EmailMessage } from "../../src/modules/notificaciones/notificaciones.service";
import { CorreosService } from "../../src/modules/correos/correos.service";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, usuarioDePrueba, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

// Correos de los flujos (fase 2): al cliente, a usuarios y casillas institucionales, con bitácora.
(RUN ? describe : describe.skip)("Correos de los flujos (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let atencionesSrv: AtencionesService;
  let gestionesSrv: GestionesService;
  let provisionesSrv: ProvisionesService;
  let correos: CorreosService;
  const PLAN = planAleatorio("COR");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let abogado: Awaited<ReturnType<typeof usuarioDePrueba>>;
  let contador: Awaited<ReturnType<typeof usuarioDePrueba>>;
  const enviados: EmailMessage[] = [];
  const CLIENTE = `cliente.${Date.now()}@ejemplo.cl`;

  beforeAll(async () => {
    process.env.CORREO_SOLICITUD_FONDOS = "solicitud.fondos@prueba.cl";
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        PlantillasService,
        GestionesService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        ProvisionesService,
        CorreosService,
        { provide: NotificacionesService, useValue: { enviarEmail: async (m: EmailMessage) => (enviados.push(m), "Omitido") } },
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    atencionesSrv = moduleRef.get(AtencionesService);
    gestionesSrv = moduleRef.get(GestionesService);
    provisionesSrv = moduleRef.get(ProvisionesService);
    correos = moduleRef.get(CorreosService);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: PLAN });
    cm = await materiaDePrueba(db);
    abogado = await usuarioDePrueba(db, "ABOGADO");
    contador = await usuarioDePrueba(db, "CONTADOR");
    const afiliadosSrv = moduleRef.get(AfiliadosService);
    const afi = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: "Clara", apellidoPaterno: "Correo", email: CLIENTE });
    afiliadoId = afi.id;
    await afiliadosSrv.asignarPlan(afiliadoId, { codPlan: PLAN, fechaInicio: "2024-01-01" });
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM correos_enviados WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await db.execute(sql`DELETE FROM gestiones WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    for (const u of [abogado, contador]) await db.execute(sql`DELETE FROM usuarios WHERE id = ${u.id}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    delete process.env.CORREO_SOLICITUD_FONDOS;
    await moduleRef.close();
  });

  it("al asignar el abogado: correo al abogado y presentación al cliente", async () => {
    enviados.length = 0;
    const a = await atencionesSrv.crear(
      { codPlan: PLAN, afiliadoId, tipo: "Asesoria", ...cm, asunto: "Correos", abogadoAsignadoId: abogado.id },
      { id: abogado.id },
    );
    expect(enviados.some((m) => m.to.includes(abogado.email.toLowerCase()) && /Atención asignada/.test(m.subject))).toBe(true);
    const presentacion = enviados.find((m) => m.to.includes(CLIENTE));
    expect(presentacion?.subject).toMatch(/Su abogado para la atención/);
    expect(presentacion?.bodyHtml).toContain(abogado.nombre);
    const bitacora = await correos.deAtencion(a.id);
    expect(bitacora.map((c) => c.plantilla)).toEqual(expect.arrayContaining(["atencion.asignada", "cliente.presentacion"]));
  });

  it("solicitud de antecedentes al cliente, escapando el texto", async () => {
    const a = await atencionesSrv.crear({ codPlan: PLAN, afiliadoId, tipo: "Asesoria", ...cm, asunto: "Antecedentes" }, { id: abogado.id });
    enviados.length = 0;
    const r = await atencionesSrv.solicitarAntecedentes(a.id, { antecedentes: "Contrato <firmado>\nFiniquito", plazo: "2030-01-15" }, { id: abogado.id });
    expect(r).toEqual({ estado: "Omitido", para: CLIENTE });
    expect(enviados[0].bodyHtml).toContain("Contrato &#60;firmado&#62;");
    expect(enviados[0].bodyText).toContain("15-01-2030");
    await drizzle(pool).update(afiliados).set({ email: null }).where(eq(afiliados.id, afiliadoId));
    await expect(atencionesSrv.solicitarAntecedentes(a.id, { antecedentes: "X" }, { id: abogado.id })).rejects.toBeInstanceOf(BadRequestException);
    await drizzle(pool).update(afiliados).set({ email: CLIENTE }).where(eq(afiliados.id, afiliadoId));
  });

  it("gestión informada al cliente: correo al iniciar y al terminar", async () => {
    const a = await atencionesSrv.crear({ codPlan: PLAN, afiliadoId, tipo: "Asesoria", ...cm, asunto: "Gestiones" }, { id: abogado.id });
    enviados.length = 0;
    const g = await gestionesSrv.crear({ atencionId: a.id, tipo: "Otra", titulo: "Revisión de contrato", responsableId: abogado.id, documentosIds: [], informarCliente: true });
    await gestionesSrv.completar(g.id, { resultado: "Contrato revisado sin observaciones" });
    const alCliente = enviados.filter((m) => m.to.includes(CLIENTE)).map((m) => m.subject);
    expect(alCliente).toEqual([expect.stringMatching(/Inicio de gestión/), expect.stringMatching(/Término de gestión/)]);
    // Sin la marca, el cliente no recibe correos de la gestión.
    enviados.length = 0;
    await gestionesSrv.crear({ atencionId: a.id, tipo: "Otra", titulo: "Interna", responsableId: abogado.id, documentosIds: [] });
    expect(enviados.filter((m) => m.to.includes(CLIENTE))).toEqual([]);
  });

  it("solicitud de provisión: correo al contador y a la casilla solicitud.fondos@", async () => {
    const a = await atencionesSrv.crear({ codPlan: PLAN, afiliadoId, tipo: "Asesoria", ...cm, asunto: "Provisión" }, { id: abogado.id });
    enviados.length = 0;
    await provisionesSrv.solicitar(a.id, abogado.id, { monto: 20_000, motivo: "Receptor" });
    const correo = enviados.find((m) => /Provisión solicitada/.test(m.subject));
    expect(correo?.to).toEqual(expect.arrayContaining([contador.email.toLowerCase(), "solicitud.fondos@prueba.cl"]));
    expect(correo?.to).not.toContain(abogado.email.toLowerCase());
  });
});
