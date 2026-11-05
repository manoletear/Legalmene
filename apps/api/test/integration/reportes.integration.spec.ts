import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { Permiso } from "@legalmene/shared";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { canales, planes } from "../../src/db/schema/planes";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { GestionesService } from "../../src/modules/gestiones/gestiones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { ReportesService } from "../../src/modules/reportes/reportes.service";
import { ExportsService } from "../../src/modules/exports/exports.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { ejecutarComo, type Acceso } from "../../src/common/acceso/contexto";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, usuarioDePrueba, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

type UsuarioPrueba = Awaited<ReturnType<typeof usuarioDePrueba>>;
const como = (u: UsuarioPrueba): Acceso => ({ usuarioId: u.id, permisos: new Set(u.permisos as Permiso[]) });

async function leerLibro(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

const encabezados = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);

// Período fijo en el pasado: las fechas de apertura y vigencias se ajustan por SQL.
const PERIODO = { desde: "2025-07-01", hasta: "2025-12-31" };

(RUN ? describe : describe.skip)("Reportes y controller (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let reportes: ReportesService;
  let exportsSrv: ExportsService;
  const PLAN = planAleatorio("REP");
  let canalId: string;
  let cm: MateriaPrueba;
  const afiliadosIds: string[] = [];
  const usuariosIds: string[] = [];
  let gerencia: UsuarioPrueba;
  let abogadoA: UsuarioPrueba;
  let abogadoB: UsuarioPrueba;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        GestionesService,
        PlantillasService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        ReportesService,
        ExportsService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
        { provide: AuditService, useValue: { log: async () => undefined } },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    reportes = moduleRef.get(ReportesService);
    exportsSrv = moduleRef.get(ExportsService);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });

    const [c] = await db.insert(canales).values({ nombre: `Canal ${PLAN}` }).returning();
    canalId = c.id;
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}`, canalId });
    cm = await materiaDePrueba(db);
    gerencia = await usuarioDePrueba(db, "GERENCIA_SERVICIOS");
    abogadoA = await usuarioDePrueba(db, "ABOGADO");
    abogadoB = await usuarioDePrueba(db, "ABOGADO");
    usuariosIds.push(gerencia.id, abogadoA.id, abogadoB.id);

    const afiliadosSrv = moduleRef.get(AfiliadosService);
    const atencionesSrv = moduleRef.get(AtencionesService);
    for (let i = 0; i < 3; i++) {
      const a = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: `Rep${i}`, apellidoPaterno: "Reporte" });
      await afiliadosSrv.asignarPlan(a.id, { codPlan: PLAN, fechaInicio: "2024-01-01" });
      afiliadosIds.push(a.id);
    }
    const [a1, a2] = afiliadosIds;
    const base = { codPlan: PLAN, ...cm };
    const abrir = async (afiliadoId: string, tipo: "Consulta" | "Juicio", fecha: string, abogado: UsuarioPrueba) => {
      const at = await atencionesSrv.crear({ ...base, afiliadoId, tipo, asunto: `${tipo} ${fecha}`, abogadoAsignadoId: abogado.id }, gerencia);
      await db.execute(sql`UPDATE atenciones SET fecha_apertura = ${`${fecha}T15:00:00Z`}::timestamptz WHERE id = ${at.id}`);
      return at;
    };
    await abrir(a1, "Consulta", "2025-09-15", abogadoA); // cuenta
    await abrir(a2, "Consulta", "2025-10-10", abogadoA); // fuera de la vigencia de a2
    await abrir(a1, "Juicio", "2025-07-05", abogadoB); // cuenta
    await abrir(a1, "Consulta", "2026-01-10", abogadoA); // fuera del período

    // a2 vigente hasta agosto (toca el período); a3 terminó antes del período.
    await db.execute(sql`UPDATE planes_afiliado SET fecha_termino = '2025-08-31' WHERE afiliado_id = ${a2} AND cod_plan = ${PLAN}`);
    await db.execute(sql`UPDATE planes_afiliado SET fecha_termino = '2025-03-31' WHERE afiliado_id = ${afiliadosIds[2]} AND cod_plan = ${PLAN}`);
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await borrarAtencionesDePlan(db, PLAN);
    for (const id of usuariosIds) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    for (const id of afiliadosIds) await db.execute(sql`DELETE FROM afiliados WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM canales WHERE id = ${canalId}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("por plan: afiliados vigentes en el período, consultas dentro de la vigencia y tasa de uso", async () => {
    const [fila] = await ejecutarComo(como(gerencia), () => reportes.porPlan(PERIODO, PLAN));
    expect(fila).toMatchObject({ codPlan: PLAN, afiliadosVigentes: 2, consultas: 1, juicios: 1, asesorias: 0, total: 2, tasaUso: 1 });
  });

  it("por canal: agrega los planes del canal con las mismas reglas", async () => {
    const filas = await ejecutarComo(como(gerencia), () => reportes.porCanal(PERIODO, canalId));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ canalId, afiliadosVigentes: 2, consultas: 1, juicios: 1, total: 2, tasaUso: 1 });
    expect(filas[0].planes.map((p) => p.codPlan)).toEqual([PLAN]);
  });

  it("afiliados activos por mes: cuenta los RUT–Plan vigentes algún día del mes", async () => {
    const serie = await reportes.afiliadosPorMes(PERIODO, { codPlan: PLAN });
    expect(serie.map((s) => [s.mes, s.activos])).toEqual([
      ["2025-07", 2],
      ["2025-08", 2],
      ["2025-09", 1],
      ["2025-10", 1],
      ["2025-11", 1],
      ["2025-12", 1],
    ]);
  });

  it("el reporte respeta el alcance: el abogado solo cuenta sus atenciones", async () => {
    const [fila] = await ejecutarComo(como(abogadoB), () => reportes.porPlan(PERIODO, PLAN));
    expect(fila).toMatchObject({ consultas: 0, juicios: 1, total: 1 });
  });

  it("controller: carga por abogado y acotada al alcance", async () => {
    const filas = await ejecutarComo(como(gerencia), () => reportes.controller({ codPlan: PLAN }));
    const a = filas.find((f) => f.usuarioId === abogadoA.id);
    const b = filas.find((f) => f.usuarioId === abogadoB.id);
    expect(a).toMatchObject({ asignadas: 3, pendientes: 3, terminadas: 0 });
    expect(b).toMatchObject({ asignadas: 1, pendientes: 1 });
    const propias = await ejecutarComo(como(abogadoA), () => reportes.controller({ codPlan: PLAN }));
    expect(propias.map((f) => f.usuarioId)).toEqual([abogadoA.id]);
  });

  it("informe XLSX: hoja Resumen + una hoja por tipo con los campos elegidos", async () => {
    const buf = await ejecutarComo(como(gerencia), () =>
      reportes.informeXlsx({ ...PERIODO, tipos: ["Consulta", "Juicio"], campos: ["correlativo", "rut", "materia"], codPlan: PLAN }),
    );
    const wb = await leerLibro(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Consultas", "Juicios"]);
    expect(encabezados(wb.getWorksheet("Consultas")!)).toEqual(["Correlativo", "RUT afiliado", "Materia"]);
    // Dos consultas en el período (el informe no filtra por vigencia) y un juicio.
    expect(wb.getWorksheet("Consultas")!.rowCount).toBe(3);
    expect(wb.getWorksheet("Juicios")!.rowCount).toBe(2);
    expect(encabezados(wb.getWorksheet("Resumen")!)).toEqual(["Plan", "Consultas", "Juicios", "Total"]);
  });

  it("exportación de búsqueda: XLSX con las columnas del Anexo y el alcance del usuario", async () => {
    const todo = await ejecutarComo(como(gerencia), () => exportsSrv.busqueda("consultas", { codPlan: PLAN }));
    expect(todo.filas).toBe(3);
    const wb = await leerLibro(todo.archivo);
    expect(encabezados(wb.worksheets[0]).slice(0, 3)).toEqual(["Correlativo", "RUT afiliado", "Nombre afiliado"]);
    const propias = await ejecutarComo(como(abogadoB), () => exportsSrv.busqueda("consultas", { codPlan: PLAN }));
    expect(propias.filas).toBe(0);
  });
});
