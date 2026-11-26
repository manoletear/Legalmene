import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { DRIZZLE, DatabaseModule, PG_POOL, type Database } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { atenciones } from "../../src/db/schema/atenciones";
import { OpenSearchService } from "../../src/modules/busqueda/opensearch.service";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;
// OpenSearch real solo si el ambiente lo trae (CI levanta uno); el resto de las pruebas no lo usa.
const URL_OS = process.env.OPENSEARCH_TEST_URL;

const configCon = (vals: Record<string, string | undefined>) => ({ get: (k: string) => vals[k] }) as unknown as ConfigService;
const filtroAfiliados = (q: string) => ({ q, page: 1, pageSize: 20 }) as Parameters<AfiliadosService["buscar"]>[0];

(RUN ? describe : describe.skip)("Búsqueda de texto completo con OpenSearch (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let db: Database;
  const PLAN = planAleatorio("OS");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let atencionId: string;
  const apellido = `Peñaloza${PLAN.slice(-4)}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule] }).compile();
    pool = moduleRef.get(PG_POOL);
    db = moduleRef.get(DRIZZLE);
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    const [a] = await db.insert(afiliados).values({ rut: rutAleatorio(), nombres: "Josefína", apellidoPaterno: apellido }).returning();
    afiliadoId = a.id;
    const [at] = await db
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `ASE-OS-${PLAN}`, afiliadoId, tipo: "Asesoria", estado: "Pendiente", ...cm, asunto: "Divorcio de mutuo acuerdo con liquidación de bienes" })
      .returning();
    atencionId = at.id;
  });

  afterAll(async () => {
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("sin OpenSearch disponible devuelve null y la búsqueda sigue funcionando con la base", async () => {
    const caido = new OpenSearchService(db, configCon({ OPENSEARCH_URL: "http://127.0.0.1:9", OPENSEARCH_INDEX_PREFIX: "test-caido" }));
    expect(caido.habilitado).toBe(true);
    expect(await caido.buscarIds("afiliados", apellido)).toBeNull();
    const afiliadosSrv = new AfiliadosService(db, undefined, caido);
    const r = await afiliadosSrv.buscar(filtroAfiliados(apellido));
    expect(r.data.map((x) => x.id)).toContain(afiliadoId);
    // Sin URL, deshabilitado y sin intentos de conexión.
    expect(new OpenSearchService(db, configCon({})).habilitado).toBe(false);
  });

  it("los candidatos del buscador filtran y ordenan en la base; sin candidatos, nada", async () => {
    const otroId = "00000000-0000-4000-8000-000000000000";
    const stub = (ids: string[]) => ({ buscarIds: async () => ids }) as unknown as OpenSearchService;
    const conCandidatos = await new AfiliadosService(db, undefined, stub([otroId, afiliadoId])).buscar(filtroAfiliados("cualquier cosa"));
    expect(conCandidatos.data.map((x) => x.id)).toEqual([afiliadoId]);
    const vacio = await new AfiliadosService(db, undefined, stub([])).buscar(filtroAfiliados("nada"));
    expect(vacio.total).toBe(0);
  });

  (URL_OS ? it : it.skip)("indexa, tolera tildes y errores de tipeo, y la base sigue aplicando los filtros", async () => {
    const os = new OpenSearchService(db, configCon({ OPENSEARCH_URL: URL_OS, OPENSEARCH_INDEX_PREFIX: `test-${PLAN.toLowerCase()}` }));
    await os.reindexar();
    await os.refrescar();
    // "divorsio" mal escrito y sin tilde en "liquidacion".
    expect(await os.buscarIds("atenciones", "divorsio liquidacion")).toContain(atencionId);
    expect(await os.buscarIds("atenciones", `ASE-OS-${PLAN}`)).toContain(atencionId);
    const afiliadosSrv = new AfiliadosService(db, undefined, os);
    const r = await afiliadosSrv.buscar(filtroAfiliados(`josefina ${apellido.replace("ñ", "n")}`));
    expect(r.data[0]?.id).toBe(afiliadoId);
    // Un cambio posterior entra con la sincronización incremental.
    await db.execute(sql`UPDATE atenciones SET asunto = 'Pensión de alimentos', updated_at = now() WHERE id = ${atencionId}`);
    await os.sincronizar();
    await os.refrescar();
    expect(await os.buscarIds("atenciones", "pension alimentos")).toContain(atencionId);
    const estado = await os.estado();
    expect(estado).toMatchObject({ habilitado: true, disponible: true });
    expect(estado.indices.find((i) => i.entidad === "atenciones")?.documentos).toBeGreaterThan(0);
  });
});
