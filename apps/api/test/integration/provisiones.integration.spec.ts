import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { atenciones } from "../../src/db/schema/atenciones";
import { provisiones } from "../../src/db/schema/provisiones";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import {
  borrarAtencionesDePlan,
  borrarMateriaDePrueba,
  materiaDePrueba,
  planAleatorio,
  rutAleatorio,
  usuarioDePrueba,
  type MateriaPrueba,
} from "./helpers";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("ProvisionesService — ciclo del Anexo §X (integration)", () => {
  let moduleRef: TestingModule;
  let service: ProvisionesService;
  let pool: Pool;
  const PLAN = planAleatorio("TP");
  const OTRO_PLAN = planAleatorio("TQ");
  let abogado: string;
  let jefe: string;
  let afiliadoId: string;
  let cm: MateriaPrueba;
  let n = 0;
  const notifs: { usuarioId: string; titulo: string }[] = [];

  async function nuevaAtencion(): Promise<string> {
    const db = drizzle(pool);
    const [at] = await db
      .insert(atenciones)
      .values({
        codPlan: PLAN,
        correlativo: `TEST-PROV-${PLAN}-${++n}`,
        afiliadoId,
        tipo: "Juicio",
        estado: "EnGestion",
        ...cm,
        asunto: "Test provisiones",
      })
      .returning();
    return at.id;
  }

  // Recorre el flujo hasta Entregada con el rol que corresponde a cada etapa.
  async function hastaEntregada(atencionId: string, monto: number) {
    const p = await service.solicitar(atencionId, abogado, { monto, motivo: "Peritaje" });
    await service.registrarPagoCliente(p.id, jefe, "Transferencia", "2026-11-02");
    await service.solicitarEntrega(p.id, abogado);
    await service.autorizar(p.id, jefe, "OK");
    await service.marcarDisponible(p.id, jefe);
    return service.entregar(p.id, jefe);
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        ProvisionesService,
        {
          provide: NotifInboxService,
          useValue: { crear: async (n: { usuarioId: string; titulo: string }) => notifs.push(n) },
        },
      ],
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
    abogado = (await usuarioDePrueba(db, "ABOGADO")).id;
    jefe = (await usuarioDePrueba(db, "GERENCIA_SERVICIOS")).id;
    const [afi] = await db
      .insert(afiliados)
      .values({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Provision" })
      .returning();
    afiliadoId = afi.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM usuarios WHERE id IN (${abogado}, ${jefe})`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan IN (${PLAN}, ${OTRO_PLAN})`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("ciclo completo: pago, autorización, entrega, gastos, reintegro y rendición", async () => {
    const atencionId = await nuevaAtencion();
    const p = await service.solicitar(atencionId, abogado, { monto: 450_000, motivo: "Peritaje" });
    expect((await service.resumenAtencion(atencionId)).pendientePago).toBe(450_000);

    expect((await service.registrarPagoCliente(p.id, jefe, "CasaCentral")).estado).toBe("Pagada");
    expect((await service.solicitarEntrega(p.id, abogado)).estado).toBe("EnAprobacion");
    expect((await service.autorizar(p.id, jefe, "Procede")).estado).toBe("Autorizada");
    expect((await service.marcarDisponible(p.id, jefe)).estado).toBe("Disponible");
    const entregada = await service.entregar(p.id, jefe);
    expect(entregada.estado).toBe("Entregada");
    expect(entregada.montoEntregado).toBe(450_000);

    await service.registrarMovimiento(p.id, abogado, { tipo: "Gasto", monto: 300_000, glosa: "Honorario perito" });
    await expect(service.rendir(p.id, abogado)).rejects.toThrow(/saldo por rendir \(\$150\.000\)/);
    await service.registrarMovimiento(p.id, abogado, { tipo: "Reintegro", monto: 150_000, glosa: "Saldo devuelto" });
    expect(await service.resumenAtencion(atencionId)).toEqual({
      provisionado: 450_000,
      entregado: 450_000,
      utilizado: 300_000,
      reintegrado: 150_000,
      saldoPorRendir: 0,
      pendientePago: 0,
    });
    expect((await service.rendir(p.id, abogado)).estado).toBe("Rendida");
    const dev = await service.registrarDevolucion(p.id, jefe, "CH-001");
    expect(dev.numeroCheque).toBe("CH-001");

    const eventos = await service.eventos(p.id);
    expect(eventos.map((e) => e.estadoHasta)).toEqual([
      "Solicitada", "Pagada", "EnAprobacion", "Autorizada", "Disponible", "Entregada", "Rendida", "Rendida",
    ]);
  });

  it("rechazar la entrega vuelve a Pagada; no se salta etapas", async () => {
    const atencionId = await nuevaAtencion();
    const p = await service.solicitar(atencionId, abogado, { monto: 10_000, motivo: "Copias" });
    await expect(service.solicitarEntrega(p.id, abogado)).rejects.toBeInstanceOf(ConflictException);
    await service.registrarPagoCliente(p.id, jefe, "Transferencia");
    await service.solicitarEntrega(p.id, abogado);
    const r = await service.rechazarEntrega(p.id, jefe, "Faltan antecedentes");
    expect(r.estado).toBe("Pagada");
    expect(r.observacionResolucion).toBe("Faltan antecedentes");
    await expect(service.autorizar(p.id, jefe)).rejects.toBeInstanceOf(ConflictException);
  });

  it("gastos solo sobre fondos entregados y nunca sobre el saldo", async () => {
    const atencionId = await nuevaAtencion();
    const p = await service.solicitar(atencionId, abogado, { monto: 50_000, motivo: "Receptor" });
    await expect(
      service.registrarMovimiento(p.id, abogado, { tipo: "Gasto", monto: 1_000, glosa: "Antes de entregar" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const e = await hastaEntregada(await nuevaAtencion(), 50_000);
    await expect(
      service.registrarMovimiento(e.id, abogado, { tipo: "Gasto", monto: 50_001, glosa: "Excede" }),
    ).rejects.toThrow(/supera el saldo/);
  });

  it("con fondos entregados sin rendir no se pide otra provisión ni otra entrega", async () => {
    const atencionId = await nuevaAtencion();
    await hastaEntregada(atencionId, 20_000);
    await expect(service.solicitar(atencionId, abogado, { monto: 5_000, motivo: "Otra" })).rejects.toThrow(/sin rendir/);
  });

  it("fondos disponibles no retirados en 2 días hábiles vuelven a Pagada y se avisa", async () => {
    const atencionId = await nuevaAtencion();
    const p = await service.solicitar(atencionId, abogado, { monto: 30_000, motivo: "Disponible" });
    await service.registrarPagoCliente(p.id, jefe, "Transferencia");
    await service.solicitarEntrega(p.id, abogado);
    await service.autorizar(p.id, jefe);
    await service.marcarDisponible(p.id, jefe);
    const db = drizzle(pool);
    // Disponible desde el lunes 2 de noviembre de 2026.
    await db.update(provisiones).set({ fechaDisponible: new Date("2026-11-02T15:00:00Z") }).where(eq(provisiones.id, p.id));

    notifs.length = 0;
    expect(await service.revertirDisponiblesVencidas("2026-11-04")).toBe(0); // 2 días hábiles: aún en plazo
    expect(await service.revertirDisponiblesVencidas("2026-11-05")).toBeGreaterThanOrEqual(1);
    const [actual] = await db.select().from(provisiones).where(eq(provisiones.id, p.id));
    expect(actual.estado).toBe("Pagada");
    expect(notifs.map((x) => x.usuarioId)).toEqual(expect.arrayContaining([abogado, jefe]));
  });

  it("filtra el listado por el plan de la atención y rechaza atenciones inexistentes", async () => {
    const atencionId = await nuevaAtencion();
    await service.solicitar(atencionId, abogado, { monto: 5_000, motivo: "Filtro" });
    expect((await service.listar({ codPlan: PLAN })).total).toBeGreaterThan(0);
    expect((await service.listar({ codPlan: OTRO_PLAN })).total).toBe(0);
    await expect(
      service.solicitar("00000000-0000-0000-0000-000000000000", abogado, { monto: 5_000, motivo: "No existe" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
