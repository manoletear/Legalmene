import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { DatabaseModule, DRIZZLE, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";

// Integration test: requires a Postgres reachable via DATABASE_URL.
// CI provides one as a service; locally export DATABASE_URL antes de correr.

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("AfiliadosService (integration)", () => {
  let moduleRef: TestingModule;
  let service: AfiliadosService;
  let pool: Pool;
  const TEST_PLAN = `TEST_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [AfiliadosService],
    }).compile();
    service = moduleRef.get(AfiliadosService);
    pool = moduleRef.get(PG_POOL);

    // Asegura schema aplicado (idempotente).
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: TEST_PLAN, nombre: `Test plan ${TEST_PLAN}` }).onConflictDoNothing();
  });

  afterAll(async () => {
    const db = moduleRef.get(DRIZZLE) as ReturnType<typeof drizzle>;
    // Cleanup: borra afiliados y plan de prueba.
    await db.execute(sql`DELETE FROM afiliados WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${TEST_PLAN}`);
    await moduleRef.close();
  });

  it("crea afiliado con RUT normalizado", async () => {
    const created = await service.crear(TEST_PLAN, {
      rut: "12.345.678-5",
      nombres: "Ana",
      apellidoPaterno: "Test",
      email: "ana@test.cl",
    });
    expect(created.rut).toBe("12345678-5");
    expect(created.codPlan).toBe(TEST_PLAN);
    expect(created.vigencia).toBe("Activo");
  });

  it("rechaza RUT con DV inválido", async () => {
    await expect(
      service.crear(TEST_PLAN, {
        rut: "12345678-9",
        nombres: "Mal",
        apellidoPaterno: "RUT",
      }),
    ).rejects.toThrow(/RUT inv/);
  });

  it("rechaza RUT duplicado en mismo plan", async () => {
    await expect(
      service.crear(TEST_PLAN, {
        rut: "12.345.678-5",
        nombres: "Duplicado",
        apellidoPaterno: "Test",
      }),
    ).rejects.toThrow(/ya existe/);
  });

  it("busca por q matchea rut o nombre", async () => {
    const result = await service.buscar(TEST_PLAN, {
      page: 1,
      pageSize: 25,
      q: "12345678",
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.data[0].rut).toBe("12345678-5");
  });

  it("soft-delete cambia vigencia a Eliminado", async () => {
    const created = await service.crear(TEST_PLAN, {
      rut: "11.111.111-1",
      nombres: "Para",
      apellidoPaterno: "Borrar",
    });
    const deleted = await service.eliminar(TEST_PLAN, created.id);
    expect(deleted.vigencia).toBe("Eliminado");
    expect(deleted.fechaEgreso).toBeTruthy();
  });

  it("aísla por codPlan: no devuelve afiliados de otro tenant", async () => {
    const result = await service.buscar("PLAN_INEXISTENTE_XYZ", {
      page: 1,
      pageSize: 25,
    });
    expect(result.total).toBe(0);
  });
});
