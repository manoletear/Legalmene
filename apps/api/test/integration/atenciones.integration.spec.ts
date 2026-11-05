import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

const numero = (correlativo: string) => parseInt(correlativo.split("-")[2], 10);

(RUN ? describe : describe.skip)("AtencionesService (integration)", () => {
  let moduleRef: TestingModule;
  let atenciones: AtencionesService;
  let afiliadosSrv: AfiliadosService;
  let pool: Pool;
  const TEST_PLAN = planAleatorio();
  let afiliadoId: string;
  let cm: MateriaPrueba;

  const base = () => ({ afiliadoId, codPlan: TEST_PLAN });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        // Stub: el test no verifica entrega real de webhooks; basta con la
        // promesa resolviendo para no romper la pipeline.
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        // Stub NotifInbox para no crear filas; firmas usadas: crear, crearSiNoExisteUnseen.
        {
          provide: NotifInboxService,
          useValue: {
            crear: async () => null,
            crearSiNoExisteUnseen: async () => null,
            crearBulk: async () => [],
          },
        },
      ],
    }).compile();
    atenciones = moduleRef.get(AtencionesService);
    afiliadosSrv = moduleRef.get(AfiliadosService);
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
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM atenciones WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${TEST_PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("genera correlativo con formato TIPO-AÑO-NNNNNN y estado Abierta", async () => {
    const a = await atenciones.crear({
      ...base(),
      tipo: "Consulta",
      ...cm,
      asunto: "Test correlativo",
    });
    expect(a.correlativo).toMatch(/^CONS-\d{4}-\d{6}$/);
    expect(a.estado).toBe("Abierta");
    expect(a.codPlan).toBe(TEST_PLAN);
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

  it("derivar Consulta a Asesoria cierra original y crea nueva con el mismo plan", async () => {
    const origen = await atenciones.crear({
      ...base(),
      tipo: "Consulta",
      ...cm,
      asunto: "A derivar",
      descripcion: "Original",
    });

    const nueva = await atenciones.derivar({
      atencionId: origen.id,
      nuevoTipo: "Asesoria",
      motivo: "Cliente requiere asesoría continua",
    });

    expect(nueva.tipo).toBe("Asesoria");
    expect(nueva.correlativo).toMatch(/^ASES-/);
    expect(nueva.codPlan).toBe(TEST_PLAN);
    expect(nueva.asunto).toBe(origen.asunto);
    expect(nueva.materiaId).toBe(origen.materiaId);
    expect((nueva.metadata as { derivadaDe?: string })?.derivadaDe).toBe(origen.id);

    const cerrada = await atenciones.obtener(origen.id);
    expect(cerrada.estado).toBe("Cerrada");
    expect(cerrada.fechaCierre).toBeTruthy();
  });

  it("rechaza derivar un Juicio", async () => {
    const j = await atenciones.crear({ ...base(), tipo: "Juicio", ...cm, asunto: "No derivable" });
    await expect(
      atenciones.derivar({ atencionId: j.id, nuevoTipo: "Asesoria", motivo: "Intento inválido" }),
    ).rejects.toThrow(/No se puede derivar un juicio/);
  });

  it("filtra búsqueda por plan", async () => {
    const res = await atenciones.buscar({ page: 1, pageSize: 200, codPlan: TEST_PLAN });
    expect(res.total).toBeGreaterThan(0);
    expect(res.data.every((a) => a.codPlan === TEST_PLAN)).toBe(true);
  });
});
