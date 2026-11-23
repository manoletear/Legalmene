import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { planAleatorio, rutAleatorio } from "./helpers";

// Integration test: requires a Postgres reachable via DATABASE_URL.
// CI provides one as a service; locally export DATABASE_URL antes de correr.

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("AfiliadosService (integration)", () => {
  let moduleRef: TestingModule;
  let service: AfiliadosService;
  let pool: Pool;
  const TEST_PLAN = planAleatorio();
  const rut = rutAleatorio();
  const creados: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [AfiliadosService],
    }).compile();
    service = moduleRef.get(AfiliadosService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: TEST_PLAN, nombre: `Test plan ${TEST_PLAN}` }).onConflictDoNothing();
  });

  afterAll(async () => {
    const db = drizzle(pool);
    for (const id of creados) {
      await db.execute(sql`DELETE FROM planes_afiliado WHERE afiliado_id = ${id}`);
      await db.execute(sql`DELETE FROM afiliados WHERE id = ${id}`);
    }
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${TEST_PLAN}`);
    await moduleRef.close();
  });

  it("crea afiliado con RUT normalizado", async () => {
    const [cuerpo, dv] = rut.split("-");
    const conPuntos = `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5)}-${dv}`;
    const created = await service.crear({
      rut: conPuntos,
      nombres: "Ana",
      apellidoPaterno: "Test",
      email: "ana@test.cl",
    });
    creados.push(created.id);
    expect(created.rut).toBe(rut);
    expect(created.vigencia).toBe("Activo");
  });

  it("rechaza RUT con DV inválido", async () => {
    await expect(
      service.crear({ rut: "12345678-9", nombres: "Mal", apellidoPaterno: "RUT" }),
    ).rejects.toThrow(/RUT inv/);
  });

  it("rechaza RUT ya registrado (la persona es única por RUT)", async () => {
    await expect(
      service.crear({ rut, nombres: "Duplicado", apellidoPaterno: "Test" }),
    ).rejects.toThrow(/ya está registrado/);
  });

  it("busca por q matchea rut", async () => {
    const result = await service.buscar({ page: 1, pageSize: 25, q: rut.split("-")[0] });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.data[0].rut).toBe(rut);
  });

  it("filtra por plan usando planes_afiliado", async () => {
    const [afi] = (await service.buscar({ page: 1, pageSize: 1, q: rut.split("-")[0] })).data;
    expect((await service.buscar({ page: 1, pageSize: 25, codPlan: TEST_PLAN })).total).toBe(0);

    await service.asignarPlan(afi.id, { codPlan: TEST_PLAN, fechaInicio: "2024-01-01" });
    const conPlan = await service.buscar({ page: 1, pageSize: 25, codPlan: TEST_PLAN });
    expect(conPlan.total).toBe(1);
    expect(conPlan.data[0].planes.map((p) => p.codPlan)).toContain(TEST_PLAN);
  });

  it("soft-delete cambia vigencia a Eliminado", async () => {
    const created = await service.crear({
      rut: rutAleatorio(),
      nombres: "Para",
      apellidoPaterno: "Borrar",
    });
    creados.push(created.id);
    const deleted = await service.eliminar(created.id);
    expect(deleted.vigencia).toBe("Eliminado");
  });
});
