import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { coberturas } from "../../src/db/schema/aranceles";
import { competencias, materias } from "../../src/db/schema/maestros";
import { atenciones } from "../../src/db/schema/atenciones";
import { CargasMasivasService } from "../../src/modules/cargas-masivas/cargas-masivas.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { GestionesService } from "../../src/modules/gestiones/gestiones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import type { AuthenticatedUser } from "../../src/common/decorators/current-user.decorator";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, usuarioDePrueba, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;
const csv = (lineas: string[]) => Buffer.from(lineas.join("\n"), "utf-8");

// Carga masiva de coberturas (Anexo §I l.54) y de atenciones (§II l.141).
(RUN ? describe : describe.skip)("Cargas masivas de coberturas y atenciones (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let service: CargasMasivasService;
  const PLAN = planAleatorio("CCA");
  let cm: MateriaPrueba;
  let comp: string;
  let mat: string;
  let admin: AuthenticatedUser;
  let sinPermisos: AuthenticatedUser;
  const usuariosIds: string[] = [];
  const RUT = rutAleatorio();
  const SIN_PLAN = rutAleatorio();
  const afiliadosIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        CargasMasivasService,
        AtencionesService,
        AfiliadosService,
        GestionesService,
        PlantillasService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
        { provide: AuditService, useValue: { log: async () => undefined } },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    service = moduleRef.get(CargasMasivasService);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    [{ nombre: comp }] = await db.select({ nombre: competencias.nombre }).from(competencias).where(eq(competencias.id, cm.competenciaId));
    [{ nombre: mat }] = await db.select({ nombre: materias.nombre }).from(materias).where(eq(materias.id, cm.materiaId));
    const a = await usuarioDePrueba(db, "ADMIN");
    const b = await usuarioDePrueba(db, "ABOGADO");
    usuariosIds.push(a.id, b.id);
    admin = a as unknown as AuthenticatedUser;
    sinPermisos = { ...b, permisos: [] } as unknown as AuthenticatedUser;
    const afiliadosSrv = moduleRef.get(AfiliadosService);
    const conPlan = await afiliadosSrv.crear({ rut: RUT, nombres: "Carga", apellidoPaterno: "Atenciones" });
    await afiliadosSrv.asignarPlan(conPlan.id, { codPlan: PLAN, fechaInicio: "2024-01-01" });
    const sinPlan = await afiliadosSrv.crear({ rut: SIN_PLAN, nombres: "Sin", apellidoPaterno: "Plan" });
    afiliadosIds.push(conPlan.id, sinPlan.id);
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM coberturas WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    for (const id of afiliadosIds) await db.execute(sql`DELETE FROM afiliados WHERE id = ${id}`);
    for (const id of usuariosIds) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("coberturas: FLUJO crea y reemplaza reglas por nombre de materia; STOCK desactiva las ausentes", async () => {
    const cabecera = "competencia,materia,tipo,modalidad,porcentaje,valor_uf";
    const r1 = await service.cargarCoberturas(
      PLAN,
      "FLUJO",
      csv([cabecera, ",,,Porcentaje,50,", `${comp.toUpperCase()},${mat},Juicio,ValorUF,,"1,5"`, `X,Y,,SinCobertura,,`, `,,Consulta,Porcentaje,,`]),
      admin,
    );
    expect(r1).toMatchObject({ insertados: 2, actualizados: 0 });
    expect(r1.errores.map((e) => e.fila)).toEqual([4, 5]);
    const db = drizzle(pool);
    const [uf] = await db.select().from(coberturas).where(and(eq(coberturas.codPlan, PLAN), eq(coberturas.materiaId, cm.materiaId)));
    expect(uf).toMatchObject({ tipo: "Juicio", modalidad: "ValorUF", valorUfCentesimas: 150 });

    const r2 = await service.cargarCoberturas(PLAN, "STOCK", csv([cabecera, ",,,Porcentaje,70,"]), admin);
    expect(r2).toMatchObject({ insertados: 0, actualizados: 1, eliminados: 1 });
    const vigentes = await db.select().from(coberturas).where(and(eq(coberturas.codPlan, PLAN), eq(coberturas.vigente, true)));
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].porcentaje).toBe(70);

    await expect(service.cargarCoberturas(PLAN, "FLUJO", csv([cabecera]), sinPermisos)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("atenciones: crea por el flujo normal y reporta filas con error sin detener la carga", async () => {
    const r = await service.cargarAtenciones(
      PLAN,
      "FLUJO",
      csv([
        "rut,tipo,competencia,materia,asunto",
        `${RUT},Consulta,${comp},${mat},Consulta cargada`,
        `${RUT},asesoría,${comp},${mat},Asesoría cargada`,
        `${SIN_PLAN},Consulta,${comp},${mat},Sin plan`,
        `${RUT},Juicio,${comp},No existe,Mala materia`,
        `${RUT},Consulta,${comp},${mat},`,
      ]),
      admin,
    );
    expect(r.insertados).toBe(2);
    expect(r.errores.map((e) => e.fila)).toEqual([4, 5, 6]);
    const creadas = await drizzle(pool).select({ tipo: atenciones.tipo, correlativo: atenciones.correlativo }).from(atenciones).where(eq(atenciones.codPlan, PLAN));
    expect(creadas.map((c) => c.tipo).sort()).toEqual(["Asesoria", "Consulta"]);

    const sinPermiso = await service.cargarAtenciones(PLAN, "FLUJO", csv(["rut,tipo,competencia,materia,asunto", `${RUT},Consulta,${comp},${mat},X`]), sinPermisos);
    expect(sinPermiso.insertados).toBe(0);
    expect(sinPermiso.errores[0].mensaje).toMatch(/Sin permiso/);
    await expect(service.cargarAtenciones(PLAN, "STOCK", csv(["rut"]), admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});
