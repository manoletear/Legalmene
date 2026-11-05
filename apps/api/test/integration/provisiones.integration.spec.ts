import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { usuarios } from "../../src/db/schema/usuarios";
import { afiliados } from "../../src/db/schema/afiliados";
import { atenciones } from "../../src/db/schema/atenciones";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { borrarMateriaDePrueba, materiaDePrueba, rutAleatorio, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("ProvisionesService (integration)", () => {
  let moduleRef: TestingModule;
  let service: ProvisionesService;
  let pool: Pool;
  const SUFIJO = Math.random().toString(36).slice(2, 8).toUpperCase();
  const PLAN = `TP_${SUFIJO}`;
  const OTRO_PLAN = `TQ_${SUFIJO}`;
  let usuarioId: string;
  let atencionId: string;
  let afiliadoId: string;
  let cm: MateriaPrueba;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [ProvisionesService],
    }).compile();
    service = moduleRef.get(ProvisionesService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values([
      { codPlan: PLAN, nombre: `Test ${PLAN}` },
      { codPlan: OTRO_PLAN, nombre: `Test ${OTRO_PLAN}` },
    ]);
    cm = await materiaDePrueba(db);
    const [u] = await db
      .insert(usuarios)
      .values({
        entraOid: `oid-${SUFIJO}`,
        email: `prov-${SUFIJO.toLowerCase()}@test.cl`,
        nombre: "Supervisor Test",
        rol: "Supervisor",
        codPlanes: [PLAN],
      })
      .returning();
    usuarioId = u.id;
    const [afi] = await db
      .insert(afiliados)
      .values({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Provision" })
      .returning();
    afiliadoId = afi.id;
    const [at] = await db
      .insert(atenciones)
      .values({
        codPlan: PLAN,
        correlativo: `TEST-PROV-${SUFIJO}`,
        afiliadoId: afi.id,
        tipo: "Juicio",
        ...cm,
        asunto: "Test provisiones",
      })
      .returning();
    atencionId = at.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM provision_movimientos WHERE provision_id IN (SELECT id FROM provisiones WHERE atencion_id = ${atencionId})`);
    await db.execute(sql`DELETE FROM provisiones WHERE atencion_id = ${atencionId}`);
    await db.execute(sql`DELETE FROM atenciones WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM usuarios WHERE id = ${usuarioId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan IN (${PLAN}, ${OTRO_PLAN})`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("aprueba una provisión, registra gastos y calcula el saldo", async () => {
    const p = await service.solicitar(atencionId, usuarioId, { monto: 450_000, motivo: "Peritaje" });
    expect(p.estado).toBe("Solicitada");
    expect((await service.resumenAtencion(atencionId)).pendiente).toBe(450_000);

    const aprobada = await service.resolver(p.id, usuarioId, "Aprobada", "OK");
    expect(aprobada.estado).toBe("Aprobada");
    expect(aprobada.resueltaPorId).toBe(usuarioId);

    await service.registrarMovimiento(p.id, usuarioId, { tipo: "Gasto", monto: 150_000, glosa: "Honorario perito" });
    await service.registrarMovimiento(p.id, usuarioId, { tipo: "Reintegro", monto: 20_000, glosa: "Devolución" });

    expect(await service.resumenAtencion(atencionId)).toEqual({
      aprobado: 450_000,
      utilizado: 130_000,
      disponible: 320_000,
      pendiente: 0,
    });
  });

  it("no permite resolver dos veces la misma provisión", async () => {
    const p = await service.solicitar(atencionId, usuarioId, { monto: 10_000, motivo: "Copias" });
    await service.resolver(p.id, usuarioId, "Rechazada");
    await expect(service.resolver(p.id, usuarioId, "Aprobada")).rejects.toBeInstanceOf(ConflictException);
  });

  it("rechaza gastos que superan el saldo o sobre provisiones no aprobadas", async () => {
    const p = await service.solicitar(atencionId, usuarioId, { monto: 50_000, motivo: "Receptor" });
    await expect(
      service.registrarMovimiento(p.id, usuarioId, { tipo: "Gasto", monto: 1_000, glosa: "Antes de aprobar" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.resolver(p.id, usuarioId, "Aprobada");
    await expect(
      service.registrarMovimiento(p.id, usuarioId, { tipo: "Gasto", monto: 50_001, glosa: "Excede" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("filtra el listado por el plan de la atención y rechaza atenciones inexistentes", async () => {
    await service.solicitar(atencionId, usuarioId, { monto: 5_000, motivo: "Filtro" });
    expect((await service.listar({ codPlan: PLAN })).total).toBeGreaterThan(0);
    expect((await service.listar({ codPlan: OTRO_PLAN })).total).toBe(0);
    await expect(
      service.solicitar("00000000-0000-0000-0000-000000000000", usuarioId, { monto: 5_000, motivo: "No existe" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
