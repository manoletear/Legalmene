import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { CargasMasivasService } from "../../src/modules/cargas-masivas/cargas-masivas.service";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("CargasMasivasService (integration)", () => {
  let moduleRef: TestingModule;
  let service: CargasMasivasService;
  let pool: Pool;
  const TEST_PLAN = `TEST_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [CargasMasivasService],
    }).compile();
    service = moduleRef.get(CargasMasivasService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: TEST_PLAN, nombre: `Test ${TEST_PLAN}` }).onConflictDoNothing();
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM afiliados WHERE cod_plan = ${TEST_PLAN}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${TEST_PLAN}`);
    await moduleRef.close();
  });

  const csv = (rows: string[][]): Buffer => {
    const header = "rut,nombres,apellido_paterno,apellido_materno,email";
    const lines = [header, ...rows.map((r) => r.join(","))];
    return Buffer.from(lines.join("\n"), "utf-8");
  };

  it("FLUJO inserta filas válidas y reporta errores por RUT inválido", async () => {
    const buf = csv([
      ["11111111-1", "Juan", "Test", "", "juan@test.cl"],
      ["22222222-2", "Maria", "Test", "", "maria@test.cl"],
      ["12345678-9", "Mal", "Rut", "", "bad@test.cl"], // DV inválido
    ]);
    const res = await service.cargarAfiliados(TEST_PLAN, "FLUJO", buf);
    expect(res.totalRegistros).toBe(3);
    expect(res.insertados).toBe(2);
    expect(res.actualizados).toBe(0);
    expect(res.eliminados).toBe(0);
    expect(res.errores).toHaveLength(1);
    expect(res.errores[0].mensaje).toMatch(/RUT inv/);
  });

  it("FLUJO de nuevo actualiza en vez de insertar (idempotente para mismos RUTs)", async () => {
    const buf = csv([
      ["11111111-1", "Juan Actualizado", "Test", "", "juan2@test.cl"],
      ["22222222-2", "Maria", "Test", "", "maria@test.cl"],
    ]);
    const res = await service.cargarAfiliados(TEST_PLAN, "FLUJO", buf);
    expect(res.insertados).toBe(0);
    expect(res.actualizados).toBe(2);
    expect(res.eliminados).toBe(0);

    // Verifica que el email se actualizó. Filtra por plan para no matchear seed DEMO.
    const db = drizzle(pool);
    const [j] = await db
      .select()
      .from(afiliados)
      .where(and(eq(afiliados.codPlan, TEST_PLAN), eq(afiliados.rut, "11111111-1")));
    expect(j.email).toBe("juan2@test.cl");
    expect(j.nombres).toBe("Juan Actualizado");
  });

  it("STOCK marca afiliados ausentes del archivo como Eliminado", async () => {
    // Archivo solo trae 11111111-1; el 22222222-2 debería marcarse Eliminado.
    const buf = csv([
      ["11111111-1", "Juan", "Test", "", "juan@test.cl"],
      ["33333333-3", "Carlos", "Nuevo", "", "carlos@test.cl"],
    ]);
    const res = await service.cargarAfiliados(TEST_PLAN, "STOCK", buf);
    expect(res.insertados).toBe(1); // Carlos
    expect(res.actualizados).toBe(1); // Juan
    expect(res.eliminados).toBe(1); // Maria

    const db = drizzle(pool);
    const [maria] = await db
      .select()
      .from(afiliados)
      .where(and(eq(afiliados.codPlan, TEST_PLAN), eq(afiliados.rut, "22222222-2")));
    expect(maria.vigencia).toBe("Eliminado");
    expect(maria.fechaEgreso).toBeTruthy();
    const [carlos] = await db
      .select()
      .from(afiliados)
      .where(and(eq(afiliados.codPlan, TEST_PLAN), eq(afiliados.rut, "33333333-3")));
    expect(carlos.vigencia).toBe("Activo");
  });

  it("rechaza RUT duplicado dentro del mismo archivo", async () => {
    const buf = csv([
      ["11111111-1", "Dup1", "X", "", ""],
      ["11111111-1", "Dup2", "X", "", ""],
    ]);
    const res = await service.cargarAfiliados(TEST_PLAN, "FLUJO", buf);
    expect(res.errores.some((e) => e.mensaje.match(/duplicado/i))).toBe(true);
  });

  it("CSV vacío retorna resultado vacío sin error", async () => {
    const buf = Buffer.from("rut,nombres,apellido_paterno\n", "utf-8");
    const res = await service.cargarAfiliados(TEST_PLAN, "FLUJO", buf);
    expect(res.totalRegistros).toBe(0);
    expect(res.insertados).toBe(0);
    expect(res.errores).toHaveLength(0);
  });
});
