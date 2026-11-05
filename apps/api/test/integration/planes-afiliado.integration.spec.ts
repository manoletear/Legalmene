import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { CargasMasivasService } from "../../src/modules/cargas-masivas/cargas-masivas.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { borrarMateriaDePrueba, fechaRelativa, materiaDePrueba, planAleatorio, rutAleatorio, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

// Vigencia RUT–Plan (Anexo §III y §VI 3.1): un RUT puede tener varios planes; solo los
// vigentes permiten nuevas atenciones y, si no hay ninguno, REZAGADO/METLIFE.
(RUN ? describe : describe.skip)("Planes del afiliado (integration)", () => {
  let moduleRef: TestingModule;
  let afiliadosSrv: AfiliadosService;
  let atencionesSrv: AtencionesService;
  let cargasSrv: CargasMasivasService;
  let pool: Pool;
  const VIGENTE = planAleatorio("PVIG");
  const VENCIDO = planAleatorio("PVEN");
  const FUTURO = planAleatorio("PFUT");
  const INACTIVO = planAleatorio("PINA");
  const NUEVO = planAleatorio("PNUE");
  const todos = [VIGENTE, VENCIDO, FUTURO, INACTIVO, NUEVO];
  const rutConPlanes = rutAleatorio();
  const rutSinPlanes = rutAleatorio();
  const rutCarga = rutAleatorio();
  let conPlanesId: string;
  let sinPlanesId: string;
  let cm: MateriaPrueba;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AfiliadosService,
        AtencionesService,
        PlantillasService,
        CargasMasivasService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null } },
      ],
    }).compile();
    afiliadosSrv = moduleRef.get(AfiliadosService);
    atencionesSrv = moduleRef.get(AtencionesService);
    cargasSrv = moduleRef.get(CargasMasivasService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values([
      { codPlan: VIGENTE, nombre: "Vigente" },
      { codPlan: VENCIDO, nombre: "Vencido" },
      { codPlan: FUTURO, nombre: "Futuro" },
      { codPlan: INACTIVO, nombre: "Producto discontinuado", vigente: false },
      { codPlan: NUEVO, nombre: "Nuevo" },
    ]);
    for (const codPlan of ["REZAGADO", "METLIFE"]) {
      await db.insert(planes).values({ codPlan, nombre: codPlan }).onConflictDoNothing();
    }
    cm = await materiaDePrueba(db);

    conPlanesId = (await afiliadosSrv.crear({ rut: rutConPlanes, nombres: "Con", apellidoPaterno: "Planes" })).id;
    sinPlanesId = (await afiliadosSrv.crear({ rut: rutSinPlanes, nombres: "Sin", apellidoPaterno: "Planes" })).id;

    await afiliadosSrv.asignarPlan(conPlanesId, { codPlan: VIGENTE, fechaInicio: fechaRelativa(-30) });
    await afiliadosSrv.asignarPlan(conPlanesId, {
      codPlan: VENCIDO,
      fechaInicio: fechaRelativa(-400),
      fechaTermino: fechaRelativa(-10),
    });
    await afiliadosSrv.asignarPlan(conPlanesId, { codPlan: FUTURO, fechaInicio: fechaRelativa(30) });
    await afiliadosSrv.asignarPlan(conPlanesId, { codPlan: INACTIVO, fechaInicio: fechaRelativa(-30) });
    await afiliadosSrv.asignarPlan(sinPlanesId, {
      codPlan: VENCIDO,
      fechaInicio: fechaRelativa(-400),
      fechaTermino: fechaRelativa(-10),
    });
  });

  afterAll(async () => {
    const db = drizzle(pool);
    const lista = sql.join(todos.map((p) => sql`${p}`), sql`, `);
    await db.execute(sql`DELETE FROM atenciones WHERE afiliado_id IN (${conPlanesId}, ${sinPlanesId})`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan IN (${lista})`);
    await db.execute(sql`DELETE FROM afiliados WHERE rut IN (${rutConPlanes}, ${rutSinPlanes}, ${rutCarga})`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan IN (${lista})`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("consulta por RUT devuelve todos los planes con vigencia calculada, vigentes primero", async () => {
    const r = await afiliadosSrv.consultarPorRut(rutConPlanes);
    expect(r.planes).toHaveLength(4);
    expect(r.planes[0]).toMatchObject({ codPlan: VIGENTE, vigente: true, nombrePlan: "Vigente" });
    const porPlan = Object.fromEntries(r.planes.map((p) => [p.codPlan, p.vigente]));
    expect(porPlan[VENCIDO]).toBe(false);
    expect(porPlan[FUTURO]).toBe(false);
    expect(porPlan[INACTIVO]).toBe(false);
  });

  it("consulta por RUT acepta el formato con puntos y rechaza RUT no registrado", async () => {
    const [cuerpo, dv] = rutConPlanes.split("-");
    const conPuntos = `${cuerpo.slice(0, 2)}.${cuerpo.slice(2, 5)}.${cuerpo.slice(5)}-${dv}`;
    expect((await afiliadosSrv.consultarPorRut(conPuntos)).id).toBe(conPlanesId);
    await expect(afiliadosSrv.consultarPorRut(rutAleatorio())).rejects.toThrow(/no está registrado/);
  });

  it("terminar un plan lo deja no vigente", async () => {
    await afiliadosSrv.asignarPlan(conPlanesId, { codPlan: NUEVO, fechaInicio: fechaRelativa(-5) });
    expect((await afiliadosSrv.consultarPorRut(rutConPlanes)).planes.find((p) => p.codPlan === NUEVO)?.vigente).toBe(true);
    await afiliadosSrv.terminarPlan(conPlanesId, NUEVO, fechaRelativa(-3));
    expect((await afiliadosSrv.consultarPorRut(rutConPlanes)).planes.find((p) => p.codPlan === NUEVO)?.vigente).toBe(false);
  });

  it("la atención se acepta bajo un plan vigente del RUT", async () => {
    const a = await atencionesSrv.crear({
      afiliadoId: conPlanesId,
      codPlan: VIGENTE,
      tipo: "Consulta",
      ...cm,
      asunto: "Con plan vigente",
    });
    expect(a.codPlan).toBe(VIGENTE);
  });

  it("rechaza la atención bajo un plan no vigente e indica los vigentes", async () => {
    await expect(
      atencionesSrv.crear({
        afiliadoId: conPlanesId,
        codPlan: VENCIDO,
        tipo: "Consulta",
        ...cm,
        asunto: "Plan vencido",
      }),
    ).rejects.toThrow(new RegExp(`no está vigente.*${VIGENTE}`));
  });

  it("no permite REZAGADO si el RUT tiene un plan vigente", async () => {
    await expect(
      atencionesSrv.crear({
        afiliadoId: conPlanesId,
        codPlan: "REZAGADO",
        tipo: "Consulta",
        ...cm,
        asunto: "Rezagado indebido",
      }),
    ).rejects.toThrow(/no está vigente/);
  });

  it("RUT sin planes vigentes: acepta REZAGADO/METLIFE y rechaza otros planes", async () => {
    const r = await atencionesSrv.crear({
      afiliadoId: sinPlanesId,
      codPlan: "REZAGADO",
      tipo: "Consulta",
      ...cm,
      asunto: "Sin cobertura",
    });
    expect(r.codPlan).toBe("REZAGADO");
    const m = await atencionesSrv.crear({
      afiliadoId: sinPlanesId,
      codPlan: "METLIFE",
      tipo: "Consulta",
      ...cm,
      asunto: "Seguro MetLife",
    });
    expect(m.codPlan).toBe("METLIFE");
    await expect(
      atencionesSrv.crear({
        afiliadoId: sinPlanesId,
        codPlan: VENCIDO,
        tipo: "Consulta",
        ...cm,
        asunto: "Plan vencido",
      }),
    ).rejects.toThrow(/no tiene planes vigentes.*REZAGADO o METLIFE/);
  });

  it("una carga STOCK deja sin vigencia el plan del RUT ausente y la atención lo respeta", async () => {
    const csv = (rows: string[]) => Buffer.from(["rut,nombres,apellido_paterno", ...rows].join("\n"));
    await cargasSrv.cargarAfiliados(NUEVO, "FLUJO", csv([`${rutCarga},Carga,Masiva`]));
    const persona = await afiliadosSrv.consultarPorRut(rutCarga);
    expect(persona.planes.find((p) => p.codPlan === NUEVO)?.vigente).toBe(true);

    await atencionesSrv.crear({
      afiliadoId: persona.id,
      codPlan: NUEVO,
      tipo: "Consulta",
      ...cm,
      asunto: "Antes del stock",
    });

    const otro = rutAleatorio();
    const res = await cargasSrv.cargarAfiliados(NUEVO, "STOCK", csv([`${otro},Otra,Persona`]));
    expect(res.eliminados).toBeGreaterThanOrEqual(1);
    expect((await afiliadosSrv.consultarPorRut(rutCarga)).planes.find((p) => p.codPlan === NUEVO)?.vigente).toBe(false);
    await expect(
      atencionesSrv.crear({
        afiliadoId: persona.id,
        codPlan: NUEVO,
        tipo: "Consulta",
        ...cm,
        asunto: "Después del stock",
      }),
    ).rejects.toThrow(/no tiene planes vigentes/);

    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM atenciones WHERE afiliado_id = ${persona.id}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${NUEVO}`);
    await db.execute(sql`DELETE FROM afiliados WHERE rut = ${otro}`);
  });
});
