import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados, planesAfiliado } from "../../src/db/schema/afiliados";
import { CargasMasivasService } from "../../src/modules/cargas-masivas/cargas-masivas.service";
import { planAleatorio, rutAleatorio } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("CargasMasivasService (integration)", () => {
  let moduleRef: TestingModule;
  let service: CargasMasivasService;
  let pool: Pool;
  const TEST_PLAN = planAleatorio();
  const OTRO_PLAN = planAleatorio("TESTB");
  const [JUAN, MARIA, CARLOS] = [rutAleatorio(), rutAleatorio(), rutAleatorio()];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [CargasMasivasService],
    }).compile();
    service = moduleRef.get(CargasMasivasService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db
      .insert(planes)
      .values([
        { codPlan: TEST_PLAN, nombre: `Test ${TEST_PLAN}` },
        { codPlan: OTRO_PLAN, nombre: `Test ${OTRO_PLAN}` },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan IN (${TEST_PLAN}, ${OTRO_PLAN})`);
    await db.execute(sql`DELETE FROM afiliados WHERE rut IN (${JUAN}, ${MARIA}, ${CARLOS})`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan IN (${TEST_PLAN}, ${OTRO_PLAN})`);
    await moduleRef.close();
  });

  const csv = (rows: string[][]): Buffer => {
    const header = "rut,nombres,apellido_paterno,email,fecha_inicio,fecha_termino";
    const lines = [header, ...rows.map((r) => r.join(","))];
    return Buffer.from(lines.join("\n"), "utf-8");
  };

  const relacion = async (rut: string, codPlan: string) => {
    const db = drizzle(pool);
    const [row] = await db
      .select({ vigencia: planesAfiliado.vigencia, fechaTermino: planesAfiliado.fechaTermino })
      .from(planesAfiliado)
      .innerJoin(afiliados, eq(planesAfiliado.afiliadoId, afiliados.id))
      .where(and(eq(afiliados.rut, rut), eq(planesAfiliado.codPlan, codPlan)));
    return row;
  };

  it("FLUJO crea personas y relaciones RUT–Plan, reporta RUT inválido", async () => {
    const res = await service.cargarAfiliados(
      TEST_PLAN,
      "FLUJO",
      csv([
        [JUAN, "Juan", "Test", "juan@test.cl", "2024-01-01", ""],
        [MARIA, "Maria", "Test", "maria@test.cl", "2024-01-01", ""],
        ["12345678-9", "Mal", "Rut", "bad@test.cl", "", ""],
      ]),
    );
    expect(res.totalRegistros).toBe(3);
    expect(res.insertados).toBe(2);
    expect(res.actualizados).toBe(0);
    expect(res.errores).toHaveLength(1);
    expect(res.errores[0].mensaje).toMatch(/RUT inv/);
  });

  it("FLUJO de nuevo actualiza la fecha de término y NO cambia datos de la persona", async () => {
    const res = await service.cargarAfiliados(
      TEST_PLAN,
      "FLUJO",
      csv([[JUAN, "Juan Cambiado", "Test", "juan2@test.cl", "2024-01-01", "2030-12-31"]]),
    );
    expect(res.insertados).toBe(0);
    expect(res.actualizados).toBe(1);

    const db = drizzle(pool);
    const [j] = await db.select().from(afiliados).where(eq(afiliados.rut, JUAN));
    expect(j.nombres).toBe("Juan");
    expect(j.email).toBe("juan@test.cl");
    expect((await relacion(JUAN, TEST_PLAN)).fechaTermino).toBe("2030-12-31");
  });

  it("un RUT existente se agrega a otro plan sin duplicar la persona", async () => {
    const res = await service.cargarAfiliados(
      OTRO_PLAN,
      "FLUJO",
      csv([[JUAN, "Juan", "Test", "juan@test.cl", "2025-01-01", ""]]),
    );
    expect(res.insertados).toBe(1);
    const db = drizzle(pool);
    const personas = await db.select().from(afiliados).where(eq(afiliados.rut, JUAN));
    expect(personas).toHaveLength(1);
    expect(await relacion(JUAN, OTRO_PLAN)).toBeTruthy();
  });

  it("STOCK termina solo las relaciones del plan ausentes del archivo", async () => {
    const res = await service.cargarAfiliados(
      TEST_PLAN,
      "STOCK",
      csv([
        [JUAN, "Juan", "Test", "juan@test.cl", "2024-01-01", ""],
        [CARLOS, "Carlos", "Nuevo", "carlos@test.cl", "", ""],
      ]),
    );
    expect(res.insertados).toBe(1); // Carlos
    expect(res.actualizados).toBe(1); // Juan
    expect(res.eliminados).toBe(1); // Maria

    const maria = await relacion(MARIA, TEST_PLAN);
    expect(maria.vigencia).toBe("Eliminado");
    expect(maria.fechaTermino).toBeTruthy();
    expect((await relacion(CARLOS, TEST_PLAN)).vigencia).toBe("Activo");
    // La relación de Juan con el otro plan no se toca.
    expect((await relacion(JUAN, OTRO_PLAN)).vigencia).toBe("Activo");
  });

  it("rechaza RUT duplicado dentro del mismo archivo", async () => {
    const res = await service.cargarAfiliados(
      TEST_PLAN,
      "FLUJO",
      csv([
        [JUAN, "Dup1", "X", "", "", ""],
        [JUAN, "Dup2", "X", "", "", ""],
      ]),
    );
    expect(res.errores.some((e) => e.mensaje.match(/duplicado/i))).toBe(true);
  });

  it("rechaza plan inexistente", async () => {
    await expect(
      service.cargarAfiliados("PLAN_NO_EXISTE", "FLUJO", csv([[JUAN, "Juan", "Test", "", "", ""]])),
    ).rejects.toThrow(/no existe/);
  });

  it("CSV vacío retorna resultado vacío sin error", async () => {
    const buf = Buffer.from("rut,nombres,apellido_paterno\n", "utf-8");
    const res = await service.cargarAfiliados(TEST_PLAN, "FLUJO", buf);
    expect(res.totalRegistros).toBe(0);
    expect(res.insertados).toBe(0);
    expect(res.errores).toHaveLength(0);
  });
});
