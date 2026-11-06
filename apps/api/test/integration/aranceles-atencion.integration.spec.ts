import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { aranceles, coberturas, valoresUf } from "../../src/db/schema/aranceles";
import { causasTermino } from "../../src/db/schema/maestros";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
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
// Fecha antigua y propia del spec para no chocar con la UF real del seed.
const FECHA_PAGO = "2001-03-15";

(RUN ? describe : describe.skip)("Arancel por atención — Anexo §IX (integration)", () => {
  let moduleRef: TestingModule;
  let atencionesSrv: AtencionesService;
  let arancelSrv: ArancelesAtencionService;
  let provisionesSrv: ProvisionesService;
  let pool: Pool;
  const PLAN = planAleatorio("TA");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let abogado: { id: string; permisos: readonly string[] };
  let jefe: { id: string; permisos: readonly string[] };
  let causaId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        PlantillasService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        ProvisionesService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
      ],
    }).compile();
    atencionesSrv = moduleRef.get(AtencionesService);
    arancelSrv = moduleRef.get(ArancelesAtencionService);
    provisionesSrv = moduleRef.get(ProvisionesService);
    pool = moduleRef.get(PG_POOL);
    const afiliadosSrv = moduleRef.get(AfiliadosService);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    // Arancel de 10 UF con 40% de cobertura: copago 6 UF.
    await db.insert(aranceles).values({ materiaId: cm.materiaId, codigo: `A-${PLAN}`, descripcion: "Test", valorUfCentesimas: 1000 });
    await db.insert(coberturas).values({ codPlan: PLAN, modalidad: "Porcentaje", porcentaje: 40 });
    await db.insert(valoresUf).values({ fecha: FECHA_PAGO, valorCentavos: 1_600_000 }).onConflictDoNothing();
    const afi = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Arancel" });
    afiliadoId = afi.id;
    await afiliadosSrv.asignarPlan(afiliadoId, { codPlan: PLAN, fechaInicio: "2024-01-01" });
    const ua = await usuarioDePrueba(db, "ABOGADO");
    const uj = await usuarioDePrueba(db, "GERENCIA_SERVICIOS");
    abogado = { id: ua.id, permisos: ua.permisos };
    jefe = { id: uj.id, permisos: uj.permisos };
    const [c] = await db.insert(causasTermino).values({ nombre: `Causa ${PLAN}` }).returning();
    causaId = c.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM coberturas WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM causas_termino WHERE id = ${causaId}`);
    await db.execute(sql`DELETE FROM usuarios WHERE id IN (${abogado.id}, ${jefe.id})`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  const nuevaAsesoria = () =>
    atencionesSrv.crear({ codPlan: PLAN, afiliadoId, ...cm, asunto: "Arancel", tipo: "Asesoria" }, abogado);

  it("ciclo rojo → naranjo → amarillo → verde con la UF del día del pago", async () => {
    const a = await nuevaAsesoria();
    const ar = await arancelSrv.obtener(a.id);
    expect(ar?.estado).toBe("Requerido");
    expect(ar?.copagoUfCentesimas).toBe(600);
    expect(ar?.coberturaPorcentaje).toBe(40);

    // Detenida: no pasa a Pendiente con el arancel impago, pero sí a "espera de arancel".
    await expect(atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" })).rejects.toThrow(/pago del arancel/);
    expect((await atencionesSrv.cambiarEstado(a.id, { estado: "EnEsperaArancel" })).estado).toBe("EnEsperaArancel");

    await arancelSrv.enviarAprobacion(a.id, abogado.id);
    const rech = await arancelSrv.rechazar(a.id, jefe.id, "Monto mal informado");
    expect(rech.estado).toBe("Requerido");
    expect(rech.motivoRechazo).toBe("Monto mal informado");

    await arancelSrv.enviarAprobacion(a.id, abogado.id);
    await expect(arancelSrv.registrarPago(a.id, jefe.id, { medio: "CasaCentral", fechaPago: FECHA_PAGO })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await arancelSrv.aprobar(a.id, jefe.id);
    await expect(arancelSrv.registrarPago(a.id, jefe.id, { medio: "CasaCentral", fechaPago: "2001-03-16" })).rejects.toThrow(
      /No hay valor UF cargado para el 16\/03\/2001/,
    );
    const pagado = await arancelSrv.registrarPago(a.id, jefe.id, { medio: "CasaCentral", fechaPago: FECHA_PAGO });
    expect(pagado.estado).toBe("Pagado");
    expect(pagado.montoClp).toBe(96_000); // 6 UF × $16.000
    expect(pagado.ufValorCentavos).toBe(1_600_000);

    expect((await atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" })).estado).toBe("Pendiente");
    const eventos = await arancelSrv.eventos(a.id);
    expect(eventos.map((e) => e.estadoHasta)).toEqual(["Requerido", "EnAprobacion", "Rechazado", "EnAprobacion", "Aprobado", "Pagado"]);
  });

  it("sin copago el arancel queda NoRequerido y no detiene la atención", async () => {
    const db = drizzle(pool);
    await db.execute(sql`UPDATE coberturas SET porcentaje = 100 WHERE cod_plan = ${PLAN}`);
    try {
      const a = await nuevaAsesoria();
      expect((await arancelSrv.obtener(a.id))?.estado).toBe("NoRequerido");
      expect((await atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" })).estado).toBe("Pendiente");
    } finally {
      await db.execute(sql`UPDATE coberturas SET porcentaje = 40 WHERE cod_plan = ${PLAN}`);
    }
  });

  it("no se termina con provisiones sin rendir; al terminar, las rendidas se cierran", async () => {
    const db = drizzle(pool);
    await db.execute(sql`UPDATE coberturas SET porcentaje = 100 WHERE cod_plan = ${PLAN}`);
    try {
      const a = await nuevaAsesoria();
      await atencionesSrv.cambiarEstado(a.id, { estado: "Pendiente" });
      const p = await provisionesSrv.solicitar(a.id, abogado.id, { monto: 10_000, motivo: "Gasto" });
      await expect(atencionesSrv.cambiarEstado(a.id, { estado: "Terminada", causaTerminoId: causaId })).rejects.toThrow(
        /provisión\(es\) de fondos sin rendir/,
      );
      await provisionesSrv.registrarPagoCliente(p.id, jefe.id, "Transferencia");
      await provisionesSrv.solicitarEntrega(p.id, abogado.id);
      await provisionesSrv.autorizar(p.id, jefe.id);
      await provisionesSrv.marcarDisponible(p.id, jefe.id);
      await provisionesSrv.entregar(p.id, jefe.id);
      await provisionesSrv.registrarMovimiento(p.id, abogado.id, { tipo: "Gasto", monto: 10_000, glosa: "Receptor" });
      await provisionesSrv.rendir(p.id, abogado.id);
      const t = await atencionesSrv.cambiarEstado(a.id, { estado: "Terminada", causaTerminoId: causaId }, abogado);
      expect(t.estado).toBe("Terminada");
      const { data } = await provisionesSrv.listarPorAtencion(a.id);
      expect(data[0].estado).toBe("Cerrada");
    } finally {
      await db.execute(sql`UPDATE coberturas SET porcentaje = 40 WHERE cod_plan = ${PLAN}`);
    }
  });
});
