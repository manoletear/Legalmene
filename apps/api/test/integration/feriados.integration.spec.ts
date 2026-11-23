import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { feriados } from "../../src/db/schema/maestros";
import { FeriadosService } from "../../src/modules/maestros/feriados.service";
import { establecerFeriados, sumarDiasHabiles } from "../../src/common/utils/dias-habiles";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("Feriados (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let srv: FeriadosService;
  // Un año lejano para no chocar con los feriados reales que carga la app.
  const ANIO = 2091;
  const MANUAL = "2091-03-14"; // miércoles

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [FeriadosService],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle/migrations" });
    srv = moduleRef.get(FeriadosService);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM feriados WHERE fecha BETWEEN '2091-01-01' AND '2091-12-31'");
    establecerFeriados([]);
    await moduleRef.close();
  });

  it("carga los legales del año una sola vez y respeta las ediciones del administrador", async () => {
    const n = await srv.asegurarLegales(ANIO);
    expect(n).toBeGreaterThanOrEqual(15);
    expect(await srv.asegurarLegales(ANIO)).toBe(0);
    const lista = await srv.listar(ANIO);
    expect(lista.every((f) => f.origen === "Legal")).toBe(true);

    const navidad = lista.find((f) => f.fecha === "2091-12-25")!;
    await srv.actualizar(navidad.id, { vigente: false });
    await srv.asegurarLegales(ANIO);
    const [fila] = await drizzle(pool).select().from(feriados).where(eq(feriados.id, navidad.id));
    expect(fila.vigente).toBe(false); // no se reactiva solo
  });

  it("un feriado manual se cuenta en los plazos y deja de contarse al desactivarlo", async () => {
    await srv.recargar();
    expect(sumarDiasHabiles("2091-03-13", 1)).toBe("2091-03-14");
    const f = await srv.crear({ fecha: MANUAL, nombre: "Elecciones" });
    expect(f.origen).toBe("Manual");
    expect(sumarDiasHabiles("2091-03-13", 1)).toBe("2091-03-15");
    await expect(srv.crear({ fecha: MANUAL, nombre: "Otro" })).rejects.toBeInstanceOf(ConflictException);
    await srv.actualizar(f.id, { vigente: false });
    expect(sumarDiasHabiles("2091-03-13", 1)).toBe("2091-03-14");
  });
});
