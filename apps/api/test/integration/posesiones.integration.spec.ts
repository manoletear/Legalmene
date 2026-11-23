import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PassThrough } from "stream";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import type { Permiso } from "@legalmene/shared";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { cargasAfiliado } from "../../src/db/schema/afiliados";
import { causasTermino } from "../../src/db/schema/maestros";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { GestionesService } from "../../src/modules/gestiones/gestiones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { PosesionesService } from "../../src/modules/posesiones/posesiones.service";
import { PosesionPdfService } from "../../src/modules/posesiones/posesion-pdf.service";
import { ReportesService } from "../../src/modules/reportes/reportes.service";
import { ExportsService } from "../../src/modules/exports/exports.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { ejecutarComo, type Acceso } from "../../src/common/acceso/contexto";
import { calcularDv } from "../../src/common/utils/rut";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, usuarioDePrueba, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;
type UsuarioPrueba = Awaited<ReturnType<typeof usuarioDePrueba>>;
const como = (u: UsuarioPrueba): Acceso => ({ usuarioId: u.id, permisos: new Set(u.permisos as Permiso[]) });

(RUN ? describe : describe.skip)("Posesión efectiva y cargas en atenciones (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let posesiones: PosesionesService;
  let atencionesSrv: AtencionesService;
  const PLAN = planAleatorio("POS");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let otroAfiliadoId: string;
  let abogado: UsuarioPrueba;
  let otroAbogado: UsuarioPrueba;
  let causaId: string;
  const usuariosIds: string[] = [];

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
        PosesionesService,
        PosesionPdfService,
        ReportesService,
        ExportsService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
        { provide: AuditService, useValue: { log: async () => undefined } },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    posesiones = moduleRef.get(PosesionesService);
    atencionesSrv = moduleRef.get(AtencionesService);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    abogado = await usuarioDePrueba(db, "ABOGADO");
    otroAbogado = await usuarioDePrueba(db, "ABOGADO");
    usuariosIds.push(abogado.id, otroAbogado.id);
    const afiliadosSrv = moduleRef.get(AfiliadosService);
    for (const nombre of ["Titular", "Otro"]) {
      const a = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: nombre, apellidoPaterno: "Posesión" });
      await afiliadosSrv.asignarPlan(a.id, { codPlan: PLAN, fechaInicio: "2024-01-01" });
      if (nombre === "Titular") afiliadoId = a.id;
      else otroAfiliadoId = a.id;
    }
    const [c] = await db.insert(causasTermino).values({ nombre: `Trámite concluido ${PLAN}` }).returning();
    causaId = c.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM herederos_posesion WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await db.execute(sql`DELETE FROM posesiones_efectivas WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await db.execute(sql`DELETE FROM gestiones WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN})`);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM cargas_afiliado WHERE cod_plan = ${PLAN}`);
    for (const id of usuariosIds) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id IN (${afiliadoId}, ${otroAfiliadoId})`);
    await db.execute(sql`DELETE FROM causas_termino WHERE id = ${causaId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("ciclo completo: POSE-AÑO-NNNNNN, requisitos por etapa, herederos y ficha PDF", async () => {
    const base = { afiliadoId, codPlan: PLAN, ...cm, asunto: "Posesión de prueba", abogadoAsignadoId: abogado.id };
    const pe = await posesiones.crear({ ...base, prioridad: "Media", causante: { causanteNombre: "Pedro Causante" } }, abogado);
    expect(pe.correlativo).toMatch(/^POSE-\d{4}-\d{6}$/);
    expect(pe.estado).toBe("Ingresada");

    await ejecutarComo(como(abogado), async () => {
      await expect(atencionesSrv.cambiarEstado(pe.id, { estado: "EnPreparacion" }, abogado)).rejects.toThrow(/RUT del causante/);
      const cuerpo = "12345678";
      await posesiones.actualizarCausante(pe.id, {
        causanteRut: `12.345.678-${calcularDv(cuerpo)}`,
        causanteNombre: "Pedro Causante",
        causanteFechaDefuncion: "2026-03-01",
        causanteUltimoDomicilio: "Av. Siempre Viva 123",
        causanteComuna: "Santiago",
      });
      // El arancel puede detener la posesión; para el flujo del test no se exige.
      await drizzle(pool).execute(sql`UPDATE aranceles_atencion SET estado = 'NoRequerido' WHERE atencion_id = ${pe.id}`);
      expect((await atencionesSrv.cambiarEstado(pe.id, { estado: "EnPreparacion" }, abogado)).estado).toBe("EnPreparacion");
      await expect(atencionesSrv.cambiarEstado(pe.id, { estado: "ListaEmision" }, abogado)).rejects.toThrow(/al menos un heredero/);

      await expect(posesiones.agregarHeredero(pe.id, { rut: "1-1", nombre: "X", calidad: "Hijo" })).rejects.toBeInstanceOf(BadRequestException);
      const h = await posesiones.agregarHeredero(pe.id, { rut: rutAleatorio(), nombre: "María Heredera", calidad: "Hijo" });
      await expect(posesiones.agregarHeredero(pe.id, { rut: h.rut, nombre: "Duplicada", calidad: "Hijo" })).rejects.toThrow(/ya está registrado/);
      const ficha = await posesiones.obtener(pe.id);
      expect(ficha.causanteRut).toBe(`12345678-${calcularDv(cuerpo)}`);
      expect(ficha.herederos.map((x) => x.nombre)).toEqual(["María Heredera"]);

      expect((await atencionesSrv.cambiarEstado(pe.id, { estado: "ListaEmision" }, abogado)).estado).toBe("ListaEmision");
      // Las gestiones predefinidas de la materia de prueba no existen; se puede terminar con causa.
      const fin = await atencionesSrv.cambiarEstado(pe.id, { estado: "Terminada", causaTerminoId: causaId }, abogado);
      expect(fin.estado).toBe("Terminada");
      await expect(posesiones.agregarHeredero(pe.id, { rut: rutAleatorio(), nombre: "Tarde", calidad: "Otro" })).rejects.toThrow(/cerrada/);

      const out = new PassThrough();
      const chunks: Buffer[] = [];
      out.on("data", (c: Buffer) => chunks.push(c));
      const fin$ = new Promise((r) => out.on("end", r));
      await moduleRef.get(PosesionPdfService).generar(pe.id, out);
      await fin$;
      const pdf = Buffer.concat(chunks);
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    });

    // Lo ajeno responde 404, también la ficha.
    await ejecutarComo(como(otroAbogado), async () => {
      await expect(posesiones.obtener(pe.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    // Reporte por plan y exportación incluyen la posesión.
    const gerencia = { usuarioId: abogado.id, permisos: new Set<Permiso>(["atenciones.ver_todas", "exportar.datos"]) };
    await ejecutarComo(gerencia, async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const [fila] = await moduleRef.get(ReportesService).porPlan({ desde: "2020-01-01", hasta: hoy }, PLAN);
      expect(fila.posesiones).toBe(1);
      const exp = await moduleRef.get(ExportsService).busqueda("posesiones", { codPlan: PLAN });
      expect(exp.filas).toBe(1);
    });
  });

  it("carga_id: solo una carga vigente del titular y del mismo plan", async () => {
    const db = drizzle(pool);
    const [vigente] = await db
      .insert(cargasAfiliado)
      .values({ afiliadoId, codPlan: PLAN, rut: rutAleatorio(), nombres: "Hija", apellidoPaterno: "Posesión", parentesco: "Hijo", fechaInicio: "2024-01-01" })
      .returning();
    const [terminada] = await db
      .insert(cargasAfiliado)
      .values({ afiliadoId, codPlan: PLAN, rut: rutAleatorio(), nombres: "Ex", apellidoPaterno: "Carga", fechaInicio: "2024-01-01", fechaTermino: "2024-06-30" })
      .returning();
    const base = { codPlan: PLAN, ...cm, asunto: "Consulta por carga", tipo: "Consulta" as const, prioridad: "Media" as const };
    await expect(atencionesSrv.crear({ ...base, afiliadoId: otroAfiliadoId, cargaId: vigente.id })).rejects.toThrow(/no pertenece/);
    await expect(atencionesSrv.crear({ ...base, afiliadoId, cargaId: terminada.id })).rejects.toThrow(/no está vigente/);
    const ok = await atencionesSrv.crear({ ...base, afiliadoId, cargaId: vigente.id });
    const ficha = await atencionesSrv.obtener(ok.id);
    expect(ficha.carga).toMatchObject({ id: vigente.id, parentesco: "Hijo" });

    const cargas = await moduleRef.get(AfiliadosService).cargas(afiliadoId);
    expect(cargas.find((c) => c.id === vigente.id)?.vigente).toBe(true);
    expect(cargas.find((c) => c.id === terminada.id)?.vigente).toBe(false);
  });
});
