import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { CreateAfiliadoSchema, UpdateAfiliadoSchema, type Permiso } from "@legalmene/shared";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { atenciones } from "../../src/db/schema/atenciones";
import { arancelesAtencion } from "../../src/db/schema/finanzas";
import { provisiones } from "../../src/db/schema/provisiones";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { DerivacionesService } from "../../src/modules/atenciones/derivaciones.service";
import { ComitesService } from "../../src/modules/comites/comites.service";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
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
type UsuarioPrueba = Awaited<ReturnType<typeof usuarioDePrueba>>;
const actor = (u: UsuarioPrueba) => ({ id: u.id, permisos: u.permisos as Permiso[] });

// Regresiones de la auditoría run-2: cuatro ojos en aprobaciones, transiciones atómicas
// (provisiones, derivaciones, comités) y ciclo de vida de afiliados.
(RUN ? describe : describe.skip)("Correcciones de seguridad — flujos y afiliados (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let prov: ProvisionesService;
  let aranceles: ArancelesAtencionService;
  let atencionesSrv: AtencionesService;
  let deriv: DerivacionesService;
  let comitesSrv: ComitesService;
  let afiliadosSrv: AfiliadosService;
  const PLAN = planAleatorio("SF");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let jefeA: UsuarioPrueba;
  let jefeB: UsuarioPrueba;
  let contador: UsuarioPrueba;
  const creados: string[] = [];
  let n = 0;

  async function juicio(estado: "EnGestion" | "Iniciada" = "EnGestion"): Promise<string> {
    const db = drizzle(pool);
    const [at] = await db
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `TEST-SF-${PLAN}-${++n}`, afiliadoId, tipo: "Juicio", estado, ...cm, asunto: "Flujos", abogadoAsignadoId: jefeA.id })
      .returning();
    return at.id;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        ProvisionesService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        AtencionesService,
        DerivacionesService,
        ComitesService,
        AfiliadosService,
        PlantillasService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    prov = moduleRef.get(ProvisionesService);
    aranceles = moduleRef.get(ArancelesAtencionService);
    atencionesSrv = moduleRef.get(AtencionesService);
    deriv = moduleRef.get(DerivacionesService);
    comitesSrv = moduleRef.get(ComitesService);
    afiliadosSrv = moduleRef.get(AfiliadosService);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    const afi = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Flujos" });
    afiliadoId = afi.id;
    await afiliadosSrv.asignarPlan(afiliadoId, { codPlan: PLAN, fechaInicio: "2024-01-01" });
    jefeA = await usuarioDePrueba(db, "JEFATURA_JUDICIAL");
    jefeB = await usuarioDePrueba(db, "JEFATURA_JUDICIAL");
    contador = await usuarioDePrueba(db, "CONTADOR");
    creados.push(jefeA.id, jefeB.id, contador.id);
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM participantes_comite WHERE comite_id IN (SELECT id FROM comites WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN}))`);
    await db.execute(sql`DELETE FROM comites WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await db.execute(sql`DELETE FROM gestiones WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await borrarAtencionesDePlan(db, PLAN);
    for (const id of creados) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("provisiones: quien pide la provisión o su entrega no la autoriza; otra jefatura sí", async () => {
    const at = await juicio();
    const p = await prov.solicitar(at, jefeA.id, { monto: 100000, motivo: "Peritaje" });
    await prov.registrarPagoCliente(p.id, contador.id, "Transferencia", "2026-11-02");
    await prov.solicitarEntrega(p.id, jefeA.id);
    await expect(prov.autorizar(p.id, jefeA.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(prov.rechazarEntrega(p.id, jefeA.id, "no")).rejects.toBeInstanceOf(ForbiddenException);
    expect((await prov.autorizar(p.id, jefeB.id)).estado).toBe("Autorizada");
  });

  it("provisiones: la reversión diaria no pisa una entrega hecha mientras corre", async () => {
    const at = await juicio();
    const p = await prov.solicitar(at, jefeB.id, { monto: 200000, motivo: "Gasto" });
    await prov.registrarPagoCliente(p.id, contador.id, "Transferencia", "2026-11-02");
    await prov.solicitarEntrega(p.id, jefeB.id);
    await prov.autorizar(p.id, jefeA.id);
    await prov.marcarDisponible(p.id, jefeA.id);
    const db = drizzle(pool);
    await db.update(provisiones).set({ fechaDisponible: new Date("2026-10-01T15:00:00Z") }).where(eq(provisiones.id, p.id));

    // Otra conexión retiene la fila; el job queda esperando su UPDATE; la fila se entrega y se libera.
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM provisiones WHERE id = $1 FOR UPDATE", [p.id]);
      const job = prov.revertirDisponiblesVencidas("2026-11-06");
      await new Promise((r) => setTimeout(r, 300));
      await holder.query("UPDATE provisiones SET estado = 'Entregada', monto_entregado = 200000 WHERE id = $1", [p.id]);
      await holder.query("COMMIT");
      expect(await job).toBe(0);
    } finally {
      holder.release();
    }
    const [row] = await db.select().from(provisiones).where(eq(provisiones.id, p.id));
    expect(row.estado).toBe("Entregada");
  });

  it("aranceles: quien lo envía a aprobación no lo aprueba ni lo rechaza", async () => {
    const at = await juicio();
    const db = drizzle(pool);
    await db.insert(arancelesAtencion).values({ atencionId: at, estado: "Requerido", copagoUfCentesimas: 100 } as never);
    await aranceles.enviarAprobacion(at, jefeA.id);
    await expect(aranceles.aprobar(at, jefeA.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(aranceles.rechazar(at, jefeA.id, "no")).rejects.toBeInstanceOf(ForbiddenException);
    expect((await aranceles.aprobar(at, jefeB.id)).estado).toBe("Aprobado");
    // Una segunda resolución sobre el mismo estado ya no aplica.
    await expect(aranceles.aprobar(at, jefeB.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it("derivaciones: el solicitante no resuelve y dos aprobaciones simultáneas crean un solo caso", async () => {
    const consulta = await atencionesSrv.crear(
      { codPlan: PLAN, afiliadoId, tipo: "Consulta", asunto: "Consulta a derivar", ...cm, abogadoAsignadoId: jefeA.id } as never,
      actor(jefeA) as never,
    );
    const d = await deriv.solicitar(consulta.id, jefeA.id, { nuevoTipo: "Juicio", motivo: "Requiere juicio" });
    await expect(deriv.aprobar(d.id, actor(jefeA) as never, {})).rejects.toBeInstanceOf(ForbiddenException);
    const otro = await usuarioDePrueba(drizzle(pool), "JEFATURA_JUDICIAL");
    creados.push(otro.id);
    const r = await Promise.allSettled([deriv.aprobar(d.id, actor(jefeB) as never, {}), deriv.aprobar(d.id, actor(otro) as never, {})]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    const db = drizzle(pool);
    const derivadas = await db.execute(sql`SELECT id FROM atenciones WHERE metadata->>'derivadaDe' = ${consulta.id}`);
    expect(derivadas.rows).toHaveLength(1);
  });

  it("comités: un comité cerrado no se vuelve a cerrar ni cambia su decisión", async () => {
    const at = await juicio();
    const c = await comitesSrv.convocar(jefeA.id, { atencionId: at, motivo: "Revisión", participantesIds: [jefeB.id] } as never);
    expect((await comitesSrv.cerrar(c.id, "Rechazado", "acta original")).decision).toBe("Rechazado");
    await expect(comitesSrv.cerrar(c.id, "Aprobado", "acta reescrita")).rejects.toBeInstanceOf(ConflictException);
    const db = drizzle(pool);
    const [row] = (await db.execute<{ decision: string; acta: string }>(sql`SELECT decision, acta FROM comites WHERE id = ${c.id}`)).rows;
    expect(row).toEqual({ decision: "Rechazado", acta: "acta original" });
  });

  it("afiliados: editar no fija ni quita 'Eliminado'; eliminar y restaurar son el único camino", async () => {
    expect(UpdateAfiliadoSchema.safeParse({ vigencia: "Eliminado" }).success).toBe(false);
    expect(CreateAfiliadoSchema.safeParse({ rut: rutAleatorio(), nombres: "X", apellidoPaterno: "Y", vigencia: "Eliminado" }).success).toBe(false);
    expect(UpdateAfiliadoSchema.safeParse({ vigencia: "Inactivo" }).success).toBe(true);
    const a = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: "Borrable", apellidoPaterno: "Test" });
    try {
      expect((await afiliadosSrv.eliminar(a.id)).vigencia).toBe("Eliminado");
      await expect(afiliadosSrv.actualizar(a.id, { vigencia: "Activo" })).rejects.toBeInstanceOf(ConflictException);
      expect((await afiliadosSrv.restaurar(a.id)).vigencia).toBe("Activo");
      await expect(afiliadosSrv.restaurar(a.id)).rejects.toBeInstanceOf(ConflictException);
    } finally {
      await drizzle(pool).execute(sql`DELETE FROM afiliados WHERE id = ${a.id}`);
    }
  });
});
