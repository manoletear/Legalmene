import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { atenciones, derivaciones } from "../../src/db/schema/atenciones";
import { arancelesAtencion, arancelesAtencionEventos } from "../../src/db/schema/finanzas";
import { provisiones, provisionesEventos } from "../../src/db/schema/provisiones";
import { gestiones } from "../../src/db/schema/gestiones";
import { CorreccionesService } from "../../src/modules/correcciones/correcciones.service";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, usuarioDePrueba, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

// Herramientas del administrador para corregir y retroceder flujos (Anexo §II l.156).
(RUN ? describe : describe.skip)("Correcciones del administrador (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let srv: CorreccionesService;
  const PLAN = planAleatorio("COR");
  const SUF = PLAN.slice(-6);
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let admin: Awaited<ReturnType<typeof usuarioDePrueba>>;
  let n = 0;

  const atencion = async (tipo: "Consulta" | "Asesoria", estado: string) => {
    const [a] = await drizzle(pool)
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `TEST-CORR-${SUF}-${++n}`, afiliadoId, tipo, estado: estado as never, ...cm, asunto: "Corrección", creadoPorId: admin.id })
      .returning();
    return a;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [CorreccionesService],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    srv = moduleRef.get(CorreccionesService);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: PLAN });
    cm = await materiaDePrueba(db);
    admin = await usuarioDePrueba(db, "ADMIN");
    const [afi] = await db.insert(afiliados).values({ rut: rutAleatorio(), nombres: "Corr", apellidoPaterno: "Test" }).returning();
    afiliadoId = afi.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM derivaciones WHERE consulta_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await db.execute(sql`DELETE FROM gestiones WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM usuarios WHERE id = ${admin.id}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("reabre una atención terminada y deja constancia; una abierta no se reabre", async () => {
    const a = await atencion("Asesoria", "Terminada");
    const r = await srv.reabrirAtencion(a.id, "Se cerró por error", admin.id);
    expect(r.estado).toBe("Pendiente");
    const [fila] = await drizzle(pool).select().from(atenciones).where(eq(atenciones.id, a.id));
    expect(fila.fechaCierre).toBeNull();
    expect((fila.metadata as { correcciones: { motivo: string }[] }).correcciones[0].motivo).toBe("Se cerró por error");
    await expect(srv.reabrirAtencion(a.id, "Otra vez", admin.id)).rejects.toBeInstanceOf(BadRequestException);
    const panorama = await srv.panorama(a.correlativo);
    expect(panorama.reabrible).toBe(false);
  });

  it("reinicia una derivación aprobada sin trabajo: abandona la derivada y la consulta vuelve a Respondida", async () => {
    const db = drizzle(pool);
    const consulta = await atencion("Consulta", "Derivada");
    const derivada = await atencion("Asesoria", "Asignada");
    const [d] = await db
      .insert(derivaciones)
      .values({ consultaId: consulta.id, nuevoTipo: "Asesoria", motivo: "Requiere asesoría", estado: "Aprobada", solicitadaPorId: admin.id, atencionDerivadaId: derivada.id })
      .returning();
    const r = await srv.reiniciarDerivacion(d.id, "Se aprobó al abogado equivocado", admin.id);
    expect(r).toMatchObject({ estado: "Solicitada", atencionDerivadaId: null });
    const [c] = await db.select({ estado: atenciones.estado }).from(atenciones).where(eq(atenciones.id, consulta.id));
    const [x] = await db.select({ estado: atenciones.estado }).from(atenciones).where(eq(atenciones.id, derivada.id));
    expect([c.estado, x.estado]).toEqual(["Respondida", "Abandonada"]);

    // Con trabajo en la derivada, no se reinicia.
    const consulta2 = await atencion("Consulta", "Derivada");
    const derivada2 = await atencion("Asesoria", "EnGestion");
    await db.insert(gestiones).values({ atencionId: derivada2.id, tipo: "Otra", titulo: "Hecha", responsableId: admin.id, estado: "Completada" });
    const [d2] = await db
      .insert(derivaciones)
      .values({ consultaId: consulta2.id, nuevoTipo: "Asesoria", motivo: "X", estado: "Aprobada", solicitadaPorId: admin.id, atencionDerivadaId: derivada2.id })
      .returning();
    await expect(srv.reiniciarDerivacion(d2.id, "No debería", admin.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it("retrocede el arancel (anulando el pago) y la provisión un paso, con evento", async () => {
    const db = drizzle(pool);
    const a = await atencion("Asesoria", "EnGestion");
    const [ar] = await db
      .insert(arancelesAtencion)
      .values({ atencionId: a.id, estado: "Pagado", fechaPago: "2026-01-02", medioPago: "CasaCentral", montoClp: 100_000, ufValorCentavos: 4_000_000 })
      .returning();
    const r = await srv.retrocederArancel(a.id, "Pago registrado en la atención equivocada", admin.id);
    expect(r).toMatchObject({ estado: "Aprobado", fechaPago: null, montoClp: null });
    const [ev] = await db.select().from(arancelesAtencionEventos).where(eq(arancelesAtencionEventos.arancelAtencionId, ar.id));
    expect(ev).toMatchObject({ estadoDesde: "Pagado", estadoHasta: "Aprobado" });

    const [p] = await db.insert(provisiones).values({ atencionId: a.id, monto: 10_000, motivo: "X", estado: "Pagada", solicitadaPorId: admin.id, medioPagoCliente: "CasaCentral" }).returning();
    const rp = await srv.retrocederProvision(p.id, "Pago duplicado", admin.id);
    expect(rp).toMatchObject({ estado: "Solicitada", medioPagoCliente: null });
    expect((await db.select().from(provisionesEventos).where(eq(provisionesEventos.provisionId, p.id)))[0].observacion).toMatch(/Corrección: Pago duplicado/);
    await expect(srv.retrocederProvision(p.id, "Más atrás", admin.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});
