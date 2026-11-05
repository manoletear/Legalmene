import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { PERFILES_SISTEMA, PERFIL_ADMIN, type Permiso } from "@legalmene/shared";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { perfiles, perfilPermisos, usuarios } from "../../src/db/schema/usuarios";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { DerivacionesService } from "../../src/modules/atenciones/derivaciones.service";
import { GestionesService } from "../../src/modules/gestiones/gestiones.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { ProvisionesService } from "../../src/modules/provisiones/provisiones.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { DashboardService } from "../../src/modules/dashboard/dashboard.service";
import { UsuariosService, UsuarioNoHabilitadoError } from "../../src/modules/usuarios/usuarios.service";
import { PerfilesService } from "../../src/modules/usuarios/perfiles.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { JwtAuthGuard } from "../../src/modules/auth/jwt-auth.guard";
import { ejecutarComo, type Acceso } from "../../src/common/acceso/contexto";
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
const como = (u: UsuarioPrueba): Acceso => ({ usuarioId: u.id, permisos: new Set(u.permisos as Permiso[]) });

(RUN ? describe : describe.skip)("Perfiles y alcance de atenciones (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let atencionesSrv: AtencionesService;
  let gestionesSrv: GestionesService;
  let provisionesSrv: ProvisionesService;
  let arancelesAtencion: ArancelesAtencionService;
  let derivacionesSrv: DerivacionesService;
  let dashboard: DashboardService;
  let usuariosSrv: UsuariosService;
  let perfilesSrv: PerfilesService;
  const PLAN = planAleatorio("ACC");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let abogadoA: UsuarioPrueba;
  let abogadoB: UsuarioPrueba;
  let jefe: UsuarioPrueba;
  let gerencia: UsuarioPrueba;
  let tramitador: UsuarioPrueba;
  let atA: string;
  let atB: string;
  let consultaB: string;
  const creados: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        DerivacionesService,
        GestionesService,
        PlantillasService,
        ProvisionesService,
        ArancelesAtencionService,
        CoberturasService,
        ArancelesService,
        DashboardService,
        UsuariosService,
        PerfilesService,
        { provide: WebhooksService, useValue: { emitir: async () => undefined } },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
        { provide: AuditService, useValue: { log: async () => undefined } },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    atencionesSrv = moduleRef.get(AtencionesService);
    gestionesSrv = moduleRef.get(GestionesService);
    provisionesSrv = moduleRef.get(ProvisionesService);
    arancelesAtencion = moduleRef.get(ArancelesAtencionService);
    derivacionesSrv = moduleRef.get(DerivacionesService);
    dashboard = moduleRef.get(DashboardService);
    usuariosSrv = moduleRef.get(UsuariosService);
    perfilesSrv = moduleRef.get(PerfilesService);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    const afiliadosSrv = moduleRef.get(AfiliadosService);
    const afi = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Acceso" });
    afiliadoId = afi.id;
    await afiliadosSrv.asignarPlan(afiliadoId, { codPlan: PLAN, fechaInicio: "2024-01-01" });

    jefe = await usuarioDePrueba(db, "JEFATURA_JUDICIAL");
    abogadoA = await usuarioDePrueba(db, "ABOGADO");
    abogadoB = await usuarioDePrueba(db, "ABOGADO", { jefeId: jefe.id });
    gerencia = await usuarioDePrueba(db, "GERENCIA_SERVICIOS");
    tramitador = await usuarioDePrueba(db, "TRAMITADOR");
    creados.push(abogadoA.id, abogadoB.id, jefe.id, gerencia.id, tramitador.id);

    const base = { afiliadoId, codPlan: PLAN, ...cm };
    // Creadas por gerencia y asignadas a cada abogado: el creador no es el abogado.
    const a = await atencionesSrv.crear({ ...base, tipo: "Juicio", asunto: "Caso A", abogadoAsignadoId: abogadoA.id }, gerencia);
    const b = await atencionesSrv.crear({ ...base, tipo: "Juicio", asunto: "Caso B", abogadoAsignadoId: abogadoB.id }, gerencia);
    const cb = await atencionesSrv.crear({ ...base, tipo: "Consulta", asunto: "Consulta B", abogadoAsignadoId: abogadoB.id }, gerencia);
    atA = a.id;
    atB = b.id;
    consultaB = cb.id;
    // El tramitador ve el caso A por tener una gestión a su cargo.
    await gestionesSrv.crear({ atencionId: atA, tipo: "Otra", titulo: "Tramitar", responsableId: tramitador.id, documentosIds: [] });
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await borrarAtencionesDePlan(db, PLAN);
    for (const id of creados) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM perfiles WHERE codigo LIKE 'TEST_%'`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  const idsVisibles = async (u: UsuarioPrueba) =>
    ejecutarComo(como(u), async () =>
      (await atencionesSrv.buscar({ page: 1, pageSize: 200, codPlan: PLAN } as never)).data.map((r) => r.id),
    );

  it("la migración crea los perfiles del sistema con sus permisos por defecto", async () => {
    const db = drizzle(pool);
    for (const p of PERFILES_SISTEMA) {
      const [row] = await db.select().from(perfiles).where(eq(perfiles.codigo, p.codigo));
      expect(row?.esSistema, p.codigo).toBe(true);
      if (p.codigo === PERFIL_ADMIN) continue;
      const asignados = await db.select({ permiso: perfilPermisos.permiso }).from(perfilPermisos).where(eq(perfilPermisos.perfilId, row.id));
      expect(new Set(asignados.map((a) => a.permiso)), p.codigo).toEqual(new Set(p.permisos));
    }
  });

  it("el abogado ve solo sus atenciones; la ajena responde 404 en lectura y en sus subrecursos", async () => {
    const ids = await idsVisibles(abogadoA);
    expect(ids).toContain(atA);
    expect(ids).not.toContain(atB);
    expect(ids).not.toContain(consultaB);

    await ejecutarComo(como(abogadoA), async () => {
      await expect(atencionesSrv.obtener(atB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(atencionesSrv.actualizar(atB, { asunto: "hack" }, abogadoA)).rejects.toBeInstanceOf(NotFoundException);
      await expect(atencionesSrv.cambiarEstado(atB, { estado: "Pendiente" }, abogadoA)).rejects.toBeInstanceOf(NotFoundException);
      await expect(gestionesSrv.listarPorAtencion(atB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(provisionesSrv.listarPorAtencion(atB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(provisionesSrv.solicitar(atB, abogadoA.id, { monto: 1000, motivo: "Gasto" })).rejects.toBeInstanceOf(NotFoundException);
      await expect(arancelesAtencion.obtener(atB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(derivacionesSrv.solicitar(consultaB, abogadoA.id, { nuevoTipo: "Juicio", motivo: "Derivar caso" })).rejects.toBeInstanceOf(NotFoundException);
      // Lo propio sí.
      expect((await atencionesSrv.obtener(atA)).id).toBe(atA);
      expect(await gestionesSrv.listarPorAtencion(atA)).toHaveLength(1);
      const k = await dashboard.kpis(PLAN);
      expect(k.atenciones.total).toBe(1);
    });
  });

  it("una provisión de una atención ajena no se puede operar (404)", async () => {
    const prov = await provisionesSrv.solicitar(atB, abogadoB.id, { monto: 5000, motivo: "Receptor" });
    await ejecutarComo(como(abogadoA), async () => {
      await expect(provisionesSrv.listarMovimientos(prov.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(provisionesSrv.registrarPagoCliente(prov.id, abogadoA.id, "Transferencia")).rejects.toBeInstanceOf(NotFoundException);
    });
    await ejecutarComo(como(abogadoB), async () => {
      expect(await provisionesSrv.listarMovimientos(prov.id)).toEqual([]);
    });
  });

  it("la jefatura ve las atenciones de su equipo y no las de otros abogados", async () => {
    const ids = await idsVisibles(jefe);
    expect(ids).toContain(atB);
    expect(ids).toContain(consultaB);
    expect(ids).not.toContain(atA);
    await ejecutarComo(como(jefe), async () => {
      await expect(arancelesAtencion.aprobar(atA, jefe.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("el tramitador ve el caso donde tiene una gestión; ver_todas ve todo", async () => {
    const ids = await idsVisibles(tramitador);
    expect(ids).toEqual([atA]);
    const todos = await idsVisibles(gerencia);
    expect(todos).toEqual(expect.arrayContaining([atA, atB, consultaB]));
  });

  it("quien crea una atención la ve aunque esté asignada a otro abogado", async () => {
    const c = await ejecutarComo(como(tramitador), () =>
      atencionesSrv.crear({ afiliadoId, codPlan: PLAN, ...cm, tipo: "Consulta", asunto: "Registrada por tramitador", abogadoAsignadoId: abogadoB.id }, tramitador),
    );
    expect(c.creadoPorId).toBe(tramitador.id);
    expect(await idsVisibles(tramitador)).toContain(c.id);
  });

  it("el perfil ADMIN no pierde permisos ni puede quedar sin administradores", async () => {
    const db = drizzle(pool);
    const [admin] = await db.select().from(perfiles).where(eq(perfiles.codigo, PERFIL_ADMIN));
    await expect(perfilesSrv.actualizar(admin.id, { permisos: [] })).rejects.toThrow(/siempre tiene todos/);
    await expect(perfilesSrv.actualizar(admin.id, { vigente: false })).rejects.toThrow(/no se puede desactivar/);
    await expect(perfilesSrv.eliminar(admin.id)).rejects.toThrow(/no se eliminan/);

    const yo = await usuarioDePrueba(db, PERFIL_ADMIN);
    creados.push(yo.id);
    const [abogadoPerfil] = await db.select().from(perfiles).where(eq(perfiles.codigo, "ABOGADO"));
    await expect(usuariosSrv.actualizarPorAdmin(yo.id, { perfilId: abogadoPerfil.id }, yo.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(usuariosSrv.bloquear(yo.id, true, "x", yo.id)).rejects.toBeInstanceOf(ConflictException);
    const ctx = await usuariosSrv.contextoAcceso(yo.id);
    expect(ctx.permisos).toContain("perfiles.administrar");
    expect(ctx.permisos).toContain("usuarios.administrar");
  });

  it("un perfil nuevo copia permisos y se aplica al usuario", async () => {
    const db = drizzle(pool);
    const [abogadoPerfil] = await db.select().from(perfiles).where(eq(perfiles.codigo, "ABOGADO"));
    const nuevo = await perfilesSrv.crear({ codigo: `TEST_${Date.now()}`, nombre: "Abogado senior", permisos: [], copiarDe: abogadoPerfil.id });
    expect(new Set(nuevo.permisos)).toEqual(new Set(PERFILES_SISTEMA.find((p) => p.codigo === "ABOGADO")!.permisos));
    const con = await perfilesSrv.actualizar(nuevo.id, { permisos: [...nuevo.permisos, "atenciones.ver_equipo"] });
    expect(con.permisos).toContain("atenciones.ver_equipo");
    const u = await usuarioDePrueba(db, nuevo.codigo);
    creados.push(u.id);
    const ctx = await usuariosSrv.contextoAcceso(u.id);
    expect(ctx.permisos).toContain("atenciones.ver_equipo");
    await db.update(usuarios).set({ perfilId: abogadoPerfil.id }).where(eq(usuarios.id, u.id));
  });

  it("usuarios bloqueados o inactivos no operan (403) y queda registro", async () => {
    const db = drizzle(pool);
    const u = await usuarioDePrueba(db, "ABOGADO");
    creados.push(u.id);
    await usuariosSrv.bloquear(u.id, true, "Salida de la empresa", gerencia.id);
    await expect(usuariosSrv.contextoAcceso(u.id)).rejects.toBeInstanceOf(UsuarioNoHabilitadoError);

    const logs: unknown[] = [];
    const guard = new JwtAuthGuard(usuariosSrv, { log: async (e: unknown) => void logs.push(e) } as unknown as AuditService);
    const req = {
      header: (h: string) =>
        h === "x-dev-user"
          ? Buffer.from(JSON.stringify({ entraOid: u.entraOid, email: u.email, nombre: u.nombre })).toString("base64")
          : undefined,
      get: () => "vitest",
      originalUrl: "/api/v1/atenciones",
    };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as never;
    const prev = process.env.AUTH_DISABLED;
    process.env.AUTH_DISABLED = "true";
    try {
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      process.env.AUTH_DISABLED = prev;
    }
    expect(logs).toHaveLength(1);
    expect((logs[0] as { accion: string }).accion).toBe("ACCESO_DENEGADO");
  });
});
