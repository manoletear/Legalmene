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

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("AtencionesService (integration)", () => {
  let moduleRef: TestingModule;
  let atenciones: AtencionesService;
  let afiliadosSrv: AfiliadosService;
  let pool: Pool;
  const TEST_PLAN = `TEST_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  let afiliadoId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [AtencionesService, AfiliadosService],
    }).compile();
    atenciones = moduleRef.get(AtencionesService);
    afiliadosSrv = moduleRef.get(AfiliadosService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: TEST_PLAN, nombre: `Test ${TEST_PLAN}` }).onConflictDoNothing();

    const afi = await afiliadosSrv.crear(TEST_PLAN, {
      rut: "12345678-5",
      nombres: "Test",
      apellidoPaterno: "Atenciones",
    });
    afiliadoId = afi.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM atenciones WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM correlativos WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${TEST_PLAN}`);
    await moduleRef.close();
  });

  it("genera correlativo CONS-YYYY-000001 en la primera consulta", async () => {
    const a = await atenciones.crear(TEST_PLAN, {
      afiliadoId,
      tipo: "Consulta",
      competencia: "Civil",
      materia: "Test correlativo",
    });
    expect(a.correlativo).toMatch(/^CONS-\d{4}-000001$/);
    expect(a.estado).toBe("Abierta");
  });

  it("incrementa correlativo atómicamente por tipo", async () => {
    const a2 = await atenciones.crear(TEST_PLAN, {
      afiliadoId,
      tipo: "Consulta",
      competencia: "Penal",
      materia: "Test 2",
    });
    expect(a2.correlativo).toMatch(/^CONS-\d{4}-000002$/);

    const j1 = await atenciones.crear(TEST_PLAN, {
      afiliadoId,
      tipo: "Juicio",
      competencia: "Penal",
      materia: "Test juicio",
    });
    expect(j1.correlativo).toMatch(/^JUIC-\d{4}-000001$/);
  });

  it("correlativos son únicos bajo concurrencia (20 inserts paralelos)", async () => {
    const promises = Array.from({ length: 20 }, () =>
      atenciones.crear(TEST_PLAN, {
        afiliadoId,
        tipo: "Asesoria",
        competencia: "Laboral",
        materia: "Concurrencia",
      }),
    );
    const results = await Promise.all(promises);
    const correlativos = results.map((r) => r.correlativo);
    expect(new Set(correlativos).size).toBe(20);
    // Asegurar que todos tienen prefijo ASES-
    for (const c of correlativos) {
      expect(c).toMatch(/^ASES-\d{4}-\d{6}$/);
    }
  });

  it("derivar Consulta a Asesoria cierra original y crea nueva con metadata", async () => {
    const origen = await atenciones.crear(TEST_PLAN, {
      afiliadoId,
      tipo: "Consulta",
      competencia: "Familia",
      materia: "A derivar",
      descripcion: "Original",
    });

    const nueva = await atenciones.derivar(TEST_PLAN, {
      atencionId: origen.id,
      nuevoTipo: "Asesoria",
      motivo: "Cliente requiere asesoría continua",
    });

    expect(nueva.tipo).toBe("Asesoria");
    expect(nueva.correlativo).toMatch(/^ASES-/);
    expect(nueva.materia).toBe(origen.materia);
    expect((nueva.metadata as { derivadaDe?: string })?.derivadaDe).toBe(origen.id);

    const cerrada = await atenciones.obtener(TEST_PLAN, origen.id);
    expect(cerrada.estado).toBe("Cerrada");
    expect(cerrada.fechaCierre).toBeTruthy();
  });

  it("rechaza derivar un Juicio", async () => {
    const j = await atenciones.crear(TEST_PLAN, {
      afiliadoId,
      tipo: "Juicio",
      competencia: "Penal",
      materia: "No derivable",
    });
    await expect(
      atenciones.derivar(TEST_PLAN, {
        atencionId: j.id,
        nuevoTipo: "Asesoria",
        motivo: "Intento inválido",
      }),
    ).rejects.toThrow(/No se puede derivar un juicio/);
  });

  it("rechaza crear atención para afiliado de otro plan", async () => {
    await expect(
      atenciones.crear("OTRO_PLAN_XYZ", {
        afiliadoId,
        tipo: "Consulta",
        competencia: "Civil",
        materia: "Cross-tenant",
      }),
    ).rejects.toThrow(/no existe en plan/);
  });
});
