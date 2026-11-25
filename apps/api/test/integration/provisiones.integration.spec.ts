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
import { ComprobantesPdfService } from "../../src/modules/exports/comprobantes-pdf.service";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import {
  borrarAtencionesDePlan,
  borrarMateriaDePrueba,
  materiaDePrueba,
  planAleatorio,
  rutAleatorio,
  usuarioDePrueba,
  comprobanteDePrueba,
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
  let contador: string;
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
    // La entrega es desde las 15:00 del día hábil siguiente a la autorización.
    await pool.query("UPDATE provisiones SET fecha_resolucion = now() - interval '10 days' WHERE id = $1", [p.id]);
    return service.entregar(p.id, jefe);
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        ProvisionesService,
        ComprobantesPdfService,
        {
          provide: NotifInboxService,
          useValue: {
            crear: async (n: { usuarioId: string; titulo: string }) => notifs.push(n),
            crearBulk: async (items: { usuarioId: string; titulo: string }[]) => notifs.push(...items),
            crearSiNoExisteUnseen: async (n: { usuarioId: string; titulo: string }) => notifs.push(n),
          },
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
    // Sin seed (CI) debe existir alguien de Finanzas a quien avisar.
    contador = (await usuarioDePrueba(db, "CONTADOR")).id;
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
    await db.execute(sql`DELETE FROM usuarios WHERE id IN (${abogado}, ${jefe}, ${contador})`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan IN (${PLAN}, ${OTRO_PLAN})`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("ciclo completo: pago, autorización, entrega, gastos, reintegro y rendición", async () => {
    const atencionId = await nuevaAtencion();
    const p = await service.solicitar(atencionId, abogado, { monto: 450_000, motivo: "Peritaje" });
    expect((await service.resumenAtencion(atencionId)).pendientePago).toBe(450_000);

    const comprobantes = moduleRef.get(ComprobantesPdfService);
    await expect(comprobantes.reciboProvision(p.id)).rejects.toThrow(/aún no registra el pago/);
    expect((await service.registrarPagoCliente(p.id, jefe, "CasaCentral")).estado).toBe("Pagada");
    // Anexo §X 05.1: recibo del dinero en dos copias.
    const recibo = await comprobantes.reciboProvision(p.id);
    expect(recibo.copias).toHaveLength(2);
    expect(recibo.secciones[1].filas).toEqual(expect.arrayContaining([["Monto recibido", "$ 450.000"], ["Forma de pago", "Pago en casa central"]]));
    expect((await service.solicitarEntrega(p.id, abogado)).estado).toBe("EnAprobacion");
    expect((await service.autorizar(p.id, jefe, "Procede")).estado).toBe("Autorizada");
    expect((await service.marcarDisponible(p.id, jefe)).estado).toBe("Disponible");
    // Anexo §X l.1673: el mismo día de la autorización todavía no se puede entregar.
    await expect(service.entregar(p.id, jefe)).rejects.toThrow(/15:00 del día hábil siguiente/);
    await pool.query("UPDATE provisiones SET fecha_resolucion = now() - interval '10 days' WHERE id = $1", [p.id]);
    const entregada = await service.entregar(p.id, jefe);
    expect(entregada.estado).toBe("Entregada");
    expect(entregada.montoEntregado).toBe(450_000);
    // Anexo §X 12: comprobante de entrega (2 copias) y cuenta corriente del abogado.
    const entrega = await moduleRef.get(ComprobantesPdfService).entregaFondos(p.id);
    expect(entrega.copias).toEqual(["Finanzas", "Abogado"]);
    expect(entrega.secciones[1].filas).toEqual(expect.arrayContaining([["Monto entregado", "$ 450.000"]]));
    const [cc] = await service.cuentaCorriente(abogado);
    expect(cc).toMatchObject({ abogadoId: abogado, porRendir: 450_000, porReingresar: 0 });

    // El gasto exige comprobante de la misma atención.
    await expect(service.registrarMovimiento(p.id, abogado, { tipo: "Gasto", monto: 300_000, glosa: "Sin comprobante" })).rejects.toThrow(
      /comprobante/,
    );
    const comprobante = await comprobanteDePrueba(drizzle(pool), p.atencionId, abogado);
    await service.registrarMovimiento(p.id, abogado, { tipo: "Gasto", monto: 300_000, glosa: "Honorario perito", documentoId: comprobante });
    // El abogado ya no registra reintegros: el saldo lo registra el contador al recibirlo.
    await expect(service.registrarMovimiento(p.id, abogado, { tipo: "Reintegro", monto: 150_000, glosa: "Saldo" })).rejects.toThrow(
      /lo registra el contador/,
    );
    // Rinde con saldo: queda pendiente de reingreso y no puede pedir más fondos ni rendir al cliente.
    expect((await service.rendir(p.id, abogado)).estado).toBe("Rendida");
    await expect(service.solicitar(atencionId, abogado, { monto: 1_000, motivo: "Otra" })).rejects.toThrow(/sin reingresar/);
    expect((await service.resumenAtencion(atencionId)).pendienteReingreso).toBe(150_000);
    expect((await service.cuentaCorriente(abogado)).find((c) => c.abogadoId === abogado)).toMatchObject({ porRendir: 0, porReingresar: 150_000 });

    // Anexo §X 14: el contador registra el reingreso del saldo exacto.
    await expect(service.registrarReingreso(p.id, jefe, 100_000)).rejects.toThrow(/saldo no gastado \(\$150\.000\)/);
    expect((await service.registrarReingreso(p.id, jefe, 150_000)).estado).toBe("Reingresado");
    const rei = await moduleRef.get(ComprobantesPdfService).reingreso(p.id);
    expect(rei.secciones[1].filas).toEqual(expect.arrayContaining([["Saldo reingresado", "$ 150.000"]]));
    expect(await service.resumenAtencion(atencionId)).toMatchObject({
      provisionado: 450_000,
      entregado: 450_000,
      utilizado: 300_000,
      reintegrado: 150_000,
      saldoPorRendir: 0,
      pendientePago: 0,
      saldoCuenta: 150_000,
      pendienteReingreso: 0,
      rendidoCliente: 0,
      rendicion: null,
    });

    // Anexo §X 16–20: rendición al cliente por el saldo de la cuenta.
    const comprobantesSrv = moduleRef.get(ComprobantesPdfService);
    await expect(service.registrarChequeDevolucion(atencionId, jefe, "CH-001")).rejects.toThrow(/No hay una rendición/);
    expect((await service.solicitarRendicionCliente(atencionId, abogado)).estado).toBe("Solicitada");
    await expect(service.solicitarRendicionCliente(atencionId, abogado)).rejects.toThrow(/en curso/);
    await expect(comprobantesSrv.rendicionCliente(atencionId)).rejects.toBeInstanceOf(ConflictException);
    const cheque = await service.registrarChequeDevolucion(atencionId, jefe, "CH-001");
    expect(cheque).toMatchObject({ estado: "ChequeEmitido", monto: 150_000, numeroCheque: "CH-001" });
    expect((await service.resumenAtencion(atencionId)).saldoCuenta).toBe(0);
    // Con la rendición en curso la cuenta queda congelada: no se piden ni entregan fondos.
    await expect(service.solicitar(atencionId, abogado, { monto: 1_000, motivo: "Durante la rendición" })).rejects.toThrow(/rendición al cliente en curso/);
    const rendicion = await comprobantesSrv.rendicionCliente(atencionId);
    expect(rendicion.copias).toHaveLength(3);
    expect(rendicion.secciones.find((x) => x.titulo === "Resumen")!.filas).toEqual(
      expect.arrayContaining([["Total provisionado", "$ 450.000"], ["Total gastado", "$ 300.000"], ["Devuelto al cliente", "$ 150.000"], ["Cheque N°", "CH-001"]]),
    );
    expect((await service.marcarRendidoCliente(atencionId, abogado)).estado).toBe("Entregada");
    await expect(service.marcarRendidoCliente(atencionId, abogado)).rejects.toBeInstanceOf(ConflictException);

    const eventos = await service.eventos(p.id);
    expect(eventos.map((e) => e.estadoHasta)).toEqual([
      "Solicitada", "Pagada", "EnAprobacion", "Autorizada", "Disponible", "Entregada", "Rendida", "Reingresado", "RendidaCliente",
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

  it("borradores: se ingresan sin avisar a Finanzas y se notifican varios a la vez", async () => {
    const atencionId = await nuevaAtencion();
    notifs.length = 0;
    const b1 = await service.solicitar(atencionId, abogado, { monto: 10_000, motivo: "Receptor", borrador: true });
    const b2 = await service.solicitar(atencionId, abogado, { monto: 20_000, motivo: "Peritaje", borrador: true });
    const b3 = await service.solicitar(atencionId, abogado, { monto: 5_000, motivo: "Copias", borrador: true });
    expect([b1.estado, b2.estado]).toEqual(["Borrador", "Borrador"]);
    expect(notifs).toEqual([]);
    expect((await service.listar({})).data.some((p) => p.id === b1.id)).toBe(false);
    const notificadas = await service.notificarBorradores(atencionId, abogado, [b1.id, b2.id]);
    expect(notificadas.map((p) => p.estado)).toEqual(["Solicitada", "Solicitada"]);
    expect(notifs.length).toBeGreaterThan(0);
    await expect(service.notificarBorradores(atencionId, abogado, [b1.id])).rejects.toThrow(/Solo se notifican borradores/);
    expect((await service.descartarBorrador(b3.id, abogado)).estado).toBe("Rechazada");
    const resumen = await service.resumenAtencion(atencionId);
    expect(resumen.pendientePago).toBe(30_000);
    // Un borrador descartado nunca cuenta como dinero del cliente (revisión de seguridad).
    expect(resumen.provisionado).toBe(0);
    expect(resumen.saldoCuenta).toBe(0);
  });

  it("decisión del cliente: no acepta o paga directo detiene el flujo; aceptar lo reinicia", async () => {
    const juicio = await nuevaAtencion();
    await expect(service.registrarDecision(juicio, abogado, { decision: "PagaDirecto" })).rejects.toThrow(/juicio/);
    await service.registrarDecision(juicio, abogado, { decision: "NoAcepta", observacion: "Lo pensará" });
    await expect(service.solicitar(juicio, abogado, { monto: 5_000, motivo: "Gastos" })).rejects.toThrow(/no aceptó/);
    const d = await service.registrarDecision(juicio, abogado, { decision: "Acepta" });
    expect(d?.decision).toBe("Acepta");
    const p = await service.solicitar(juicio, abogado, { monto: 5_000, motivo: "Gastos" });
    // Con una provisión en curso no se registra que el cliente deja de provisionar.
    await expect(service.registrarDecision(juicio, abogado, { decision: "NoAcepta" })).rejects.toThrow(/en curso/);
    expect(p.estado).toBe("Solicitada");

    const db = drizzle(pool);
    const [asesoria] = await db
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `TEST-PROV-${PLAN}-${++n}`, afiliadoId, tipo: "Asesoria", estado: "EnGestion", ...cm, asunto: "Paga directo" })
      .returning();
    await service.registrarDecision(asesoria.id, abogado, { decision: "PagaDirecto" });
    await expect(service.solicitar(asesoria.id, abogado, { monto: 5_000, motivo: "Gastos" })).rejects.toThrow(/paga directamente/);
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
    // Último día del plazo: recordatorio al abogado (y a su jefatura, si tiene).
    expect(notifs.filter((x) => /Retire hoy/.test(x.titulo)).map((x) => x.usuarioId)).toContain(abogado);
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
