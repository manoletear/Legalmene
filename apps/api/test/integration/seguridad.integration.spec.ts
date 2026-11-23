import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import type { Permiso } from "@legalmene/shared";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { perfiles, perfilPermisos, usuarios } from "../../src/db/schema/usuarios";
import { pagos } from "../../src/db/schema/pagos";
import { AfiliadosService } from "../../src/modules/afiliados/afiliados.service";
import { AtencionesService } from "../../src/modules/atenciones/atenciones.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { ArancelesAtencionService } from "../../src/modules/coberturas/aranceles-atencion.service";
import { PlantillasService } from "../../src/modules/gestiones/plantillas.service";
import { PagosService } from "../../src/modules/pagos/pagos.service";
import { DocumentosService } from "../../src/modules/documentos/documentos.service";
import { DOC_STORAGE } from "../../src/modules/documentos/storage.token";
import { UsuariosService } from "../../src/modules/usuarios/usuarios.service";
import { PerfilesService } from "../../src/modules/usuarios/perfiles.service";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { AuditService } from "../../src/modules/audit/audit.service";
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
import { ulid } from "ulid";

// Regresiones de la auditoría de seguridad (run-1): alcance en pagos/copago/documentos,
// confirmación de pagos, delegación de perfiles y secretos de webhooks.
(RUN ? describe : describe.skip)("Correcciones de seguridad (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let pagosSrv: PagosService;
  let coberturasSrv: CoberturasService;
  let documentosSrv: DocumentosService;
  let usuariosSrv: UsuariosService;
  let perfilesSrv: PerfilesService;
  let webhooksSrv: WebhooksService;
  const PLAN = planAleatorio("SEG");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  let tramitador: UsuarioPrueba;
  let abogado: UsuarioPrueba;
  let gerencia: UsuarioPrueba;
  let admin: UsuarioPrueba;
  let atAjena: string;
  let atPropia: string;
  const creados: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        AtencionesService,
        AfiliadosService,
        CoberturasService,
        ArancelesService,
        ArancelesAtencionService,
        PlantillasService,
        PagosService,
        DocumentosService,
        UsuariosService,
        PerfilesService,
        WebhooksService,
        {
          provide: DOC_STORAGE,
          useValue: { bucketName: "test", exists: async () => true, generateDownloadUrl: async () => "https://descarga.test/x" },
        },
        { provide: NotifInboxService, useValue: { crear: async () => null, crearSiNoExisteUnseen: async () => null, crearBulk: async () => [] } },
        { provide: AuditService, useValue: { log: async () => undefined } },
      ],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    pagosSrv = moduleRef.get(PagosService);
    coberturasSrv = moduleRef.get(CoberturasService);
    documentosSrv = moduleRef.get(DocumentosService);
    usuariosSrv = moduleRef.get(UsuariosService);
    perfilesSrv = moduleRef.get(PerfilesService);
    webhooksSrv = moduleRef.get(WebhooksService);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    const afiliadosSrv = moduleRef.get(AfiliadosService);
    const afi = await afiliadosSrv.crear({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Seguridad" });
    afiliadoId = afi.id;
    await afiliadosSrv.asignarPlan(afiliadoId, { codPlan: PLAN, fechaInicio: "2024-01-01" });

    tramitador = await usuarioDePrueba(db, "TRAMITADOR");
    abogado = await usuarioDePrueba(db, "ABOGADO");
    gerencia = await usuarioDePrueba(db, "GERENCIA_SERVICIOS");
    admin = await usuarioDePrueba(db, "ADMIN");
    creados.push(tramitador.id, abogado.id, gerencia.id, admin.id);

    const atencionesSrv = moduleRef.get(AtencionesService);
    const base = { afiliadoId, codPlan: PLAN, ...cm, tipo: "Juicio" as const };
    atAjena = (await atencionesSrv.crear({ ...base, asunto: "Ajena", abogadoAsignadoId: gerencia.id }, gerencia)).id;
    atPropia = (await atencionesSrv.crear({ ...base, asunto: "Propia", abogadoAsignadoId: abogado.id }, gerencia)).id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM pagos WHERE cod_plan = ${PLAN}`);
    await db.execute(
      sql`DELETE FROM documentos WHERE atencion_id IN (SELECT id FROM atenciones WHERE cod_plan = ${PLAN}) OR subido_por IN (${sql.join(creados.map((id) => sql`${id}`), sql`, `)})`,
    );
    await db.execute(sql`DELETE FROM webhooks_suscripciones WHERE cod_plan = ${PLAN}`);
    await borrarAtencionesDePlan(db, PLAN);
    for (const id of creados) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM usuarios WHERE perfil_id IN (SELECT id FROM perfiles WHERE codigo LIKE 'SEG_%')`);
    await db.execute(sql`DELETE FROM perfiles WHERE codigo LIKE 'SEG_%'`);
    await db.execute(sql`DELETE FROM planes_afiliado WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("pagos: un tramitador no lista ni inicia pagos de atenciones que no ve", async () => {
    const db = drizzle(pool);
    await db.insert(pagos).values({
      codPlan: PLAN, afiliadoId, atencionId: atAjena, monto: 777, ordenCompra: `OC-SEG-${PLAN}`, estado: "Iniciado", proveedor: "WebPay",
    });
    await ejecutarComo(como(tramitador), async () => {
      expect((await pagosSrv.listar({ codPlan: PLAN })).total).toBe(0);
      await expect(
        pagosSrv.iniciar({ afiliadoId, codPlan: PLAN, atencionId: atAjena, monto: 1, returnUrl: "https://x.test/r" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
    // Sin contexto (sistema) o con ver_todas sí se ve.
    expect((await pagosSrv.listar({ codPlan: PLAN })).total).toBe(1);
  });

  it("pagos: confirmar resuelve solo un pago Iniciado, una vez", async () => {
    const oc = `OC-SEG-${PLAN}`;
    expect((await pagosSrv.confirmar(oc, "A1", true)).estado).toBe("Autorizado");
    await expect(pagosSrv.confirmar(oc, "A2", false)).rejects.toBeInstanceOf(ConflictException);
    await expect(pagosSrv.confirmar("OC-NO-EXISTE", "x", true)).rejects.toBeInstanceOf(NotFoundException);
    const db = drizzle(pool);
    const [p] = await db.select().from(pagos).where(eq(pagos.ordenCompra, oc));
    expect(p.estado).toBe("Autorizado");
    expect(p.authCode).toBe("A1");
  });

  it("copago: una atención fuera del alcance responde 404", async () => {
    await ejecutarComo(como(abogado), async () => {
      await expect(coberturasSrv.copagoAtencion(atAjena)).rejects.toBeInstanceOf(NotFoundException);
      expect((await coberturasSrv.copagoAtencion(atPropia)).codPlan).toBe(PLAN);
    });
  });

  it("documentos: la clave debe ser la emitida para esa atención y no estar registrada", async () => {
    const anio = new Date().getUTCFullYear();
    const claveAjena = `atenciones/${anio}/${atAjena}/${ulid()}-secreto.txt`;
    const base = { nombre: "x.txt", mimeType: "text/plain", tamanoBytes: 1, sha256: "x" };
    // El dueño registra su documento.
    const original = await ejecutarComo(como(gerencia), () =>
      documentosSrv.register({ ...base, atencionId: atAjena, s3Key: claveAjena, subidoPor: gerencia.id }),
    );
    await ejecutarComo(como(abogado), async () => {
      // Reusar la clave ajena sin atención o en una atención propia: rechazado.
      await expect(documentosSrv.register({ ...base, s3Key: claveAjena, subidoPor: abogado.id })).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        documentosSrv.register({ ...base, atencionId: atPropia, s3Key: claveAjena, subidoPor: abogado.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(documentosSrv.generateDownloadUrl(original.id)).rejects.toBeInstanceOf(NotFoundException);
    });
    // La misma clave no se puede registrar dos veces, ni siquiera por el dueño.
    await ejecutarComo(como(gerencia), async () => {
      await expect(
        documentosSrv.register({ ...base, atencionId: atAjena, s3Key: claveAjena, subidoPor: gerencia.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    // Sin atención: solo quien lo subió (o quien ve todas) lo descarga.
    const suelto = await ejecutarComo(como(abogado), () =>
      documentosSrv.register({ ...base, s3Key: `atenciones/${anio}/sin-atencion/${ulid()}-mio.txt`, subidoPor: abogado.id }),
    );
    expect((await ejecutarComo(como(abogado), () => documentosSrv.generateDownloadUrl(suelto.id))).url).toBeTruthy();
    await ejecutarComo(como(tramitador), async () => {
      await expect(documentosSrv.generateDownloadUrl(suelto.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("perfiles: usuarios.administrar no basta para asignarse ADMIN ni permisos que no tiene", async () => {
    const db = drizzle(pool);
    const [p] = await db.insert(perfiles).values({ codigo: `SEG_USR_${PLAN}`.slice(0, 40), nombre: "Gestor usuarios" }).returning();
    await db.insert(perfilPermisos).values({ perfilId: p.id, permiso: "usuarios.administrar" });
    const gestor = await usuarioDePrueba(db, p.codigo);
    creados.push(gestor.id);
    const [adminPerfil] = await db.select().from(perfiles).where(eq(perfiles.codigo, "ADMIN"));
    const [abogadoPerfil] = await db.select().from(perfiles).where(eq(perfiles.codigo, "ABOGADO"));

    await expect(usuariosSrv.actualizarPorAdmin(gestor.id, { perfilId: adminPerfil.id }, gestor.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(usuariosSrv.actualizarPorAdmin(tramitador.id, { perfilId: adminPerfil.id }, gestor.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(usuariosSrv.actualizarPorAdmin(tramitador.id, { perfilId: abogadoPerfil.id }, gestor.id)).rejects.toBeInstanceOf(ForbiddenException);
    // Un ADMIN sí puede asignar cualquier perfil a otro usuario.
    expect((await usuariosSrv.actualizarPorAdmin(tramitador.id, { perfilId: abogadoPerfil.id }, admin.id)).perfilId).toBe(abogadoPerfil.id);
    const [tram] = await db.select().from(perfiles).where(eq(perfiles.codigo, "TRAMITADOR"));
    await usuariosSrv.actualizarPorAdmin(tramitador.id, { perfilId: tram.id }, admin.id);

    // perfiles.administrar tampoco puede agregarse permisos que no tiene.
    const soloPerfiles: Acceso = { usuarioId: gestor.id, permisos: new Set(["perfiles.administrar"] as Permiso[]) };
    await ejecutarComo(soloPerfiles, async () => {
      await expect(perfilesSrv.actualizar(p.id, { permisos: ["usuarios.administrar", "auditoria.ver"] })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Quitar o mantener permisos existentes sí se puede.
      expect((await perfilesSrv.actualizar(p.id, { permisos: ["usuarios.administrar"] })).permisos).toEqual(["usuarios.administrar"]);
    });
  });

  it("webhooks: el listado no expone el secreto ni los valores de las cabeceras", async () => {
    const creada = await webhooksSrv.crear(PLAN, {
      nombre: "Receptor", url: "https://receptor.test/hook", eventos: ["atencion.creada"], headers: { Authorization: "Bearer CLAVE" },
    });
    expect(creada.secret).toMatch(/^[0-9a-f]{64}$/);
    const [fila] = await webhooksSrv.listar(PLAN);
    expect(fila).not.toHaveProperty("secret");
    expect(fila.headers).toEqual({ Authorization: "********" });
    const actualizada = await webhooksSrv.actualizar(PLAN, creada.id, { nombre: "Otro", secret: "x" } as never);
    expect(actualizada).not.toHaveProperty("secret");
    const db = drizzle(pool);
    const [row] = await db.execute<{ secret: string }>(sql`SELECT secret FROM webhooks_suscripciones WHERE id = ${creada.id}`).then((r) => r.rows);
    expect(row.secret).toBe(creada.secret);
    const rotado = await webhooksSrv.rotarSecreto(PLAN, creada.id);
    expect(rotado.secret).not.toBe(creada.secret);
  });

  it("sesiones: cerrar sesión sube la versión y la sesión anterior deja de coincidir", async () => {
    const antes = await usuariosSrv.contextoAcceso(abogado.id);
    await usuariosSrv.revocarSesiones(abogado.id);
    const despues = await usuariosSrv.contextoAcceso(abogado.id);
    expect(despues.sesionVersion).toBe(antes.sesionVersion + 1);
    const db = drizzle(pool);
    const [u] = await db.select({ v: usuarios.sesionVersion }).from(usuarios).where(eq(usuarios.id, abogado.id));
    expect(u.v).toBe(despues.sesionVersion);
  });
});
