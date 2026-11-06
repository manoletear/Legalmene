import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { perfiles, usuarios, enlacesAcceso } from "../../src/db/schema/usuarios";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificacionesService, type EmailMessage } from "../../src/modules/notificaciones/notificaciones.service";
import { UsuariosService } from "../../src/modules/usuarios/usuarios.service";
import { EnlacesAccesoService, MAX_ENLACES_POR_VENTANA, hashToken } from "../../src/modules/auth/enlaces-acceso.service";
import { verificarSesion } from "../../src/modules/auth/sesion";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("Login con enlace de acceso (integration)", () => {
  let moduleRef: TestingModule;
  let srv: EnlacesAccesoService;
  let pool: Pool;
  const enviados: EmailMessage[] = [];
  const SUF = Math.random().toString(36).slice(2, 8);
  const email = `enlace-${SUF}@legalchile.cl`;
  const bootstrap = `boot-${SUF}@legalchile.cl`;
  let usuarioId: string;
  const authPrevio = process.env.AUTH_DISABLED;

  const tokenDe = (m: EmailMessage) => new URL(/https?:\/\/\S+?(?=["\s]|$)/.exec(m.bodyText ?? "")![0]).searchParams.get("token")!;

  beforeAll(async () => {
    process.env.AUTH_DISABLED = "false";
    process.env.WEB_ORIGIN = "http://localhost:4200";
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [
        EnlacesAccesoService,
        UsuariosService,
        { provide: AuditService, useValue: { log: async () => undefined } },
        { provide: NotificacionesService, useValue: { enviarEmail: async (m: EmailMessage) => void enviados.push(m) } },
      ],
    }).compile();
    srv = moduleRef.get(EnlacesAccesoService);
    pool = moduleRef.get(PG_POOL);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    const [perfil] = await db.select({ id: perfiles.id }).from(perfiles).where(eq(perfiles.codigo, "ABOGADO"));
    const [u] = await db.insert(usuarios).values({ entraOid: `test-${SUF}`, email, nombre: "Ana Enlace", perfilId: perfil.id }).returning();
    usuarioId = u.id;
  });

  afterEach(() => {
    enviados.length = 0;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM usuarios WHERE email IN (${email}, ${bootstrap})`);
    process.env.AUTH_DISABLED = authPrevio;
    delete process.env.BOOTSTRAP_ADMIN_EMAILS;
    await moduleRef.close();
  });

  it("envía el enlace, lo canjea una sola vez por una sesión y guarda solo el hash", async () => {
    const r = await srv.solicitar(email.toUpperCase(), { origen: "http://localhost:4200" });
    expect(r).toEqual({ ok: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toEqual([email]);
    const token = tokenDe(enviados[0]);
    const db = drizzle(pool);
    const filas = await db.select().from(enlacesAcceso).where(eq(enlacesAcceso.usuarioId, usuarioId));
    expect(filas.some((f) => f.tokenHash === hashToken(token))).toBe(true);
    expect(filas.some((f) => f.tokenHash === token)).toBe(false);

    const sesion = await srv.verificar(token);
    expect(verificarSesion(sesion.token)?.usuarioId).toBe(usuarioId);
    await expect(srv.verificar(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("no revela correos inexistentes ni de otro dominio, y no envía nada", async () => {
    expect(await srv.solicitar(`nadie-${SUF}@legalchile.cl`)).toEqual({ ok: true });
    expect(await srv.solicitar(`ana-${SUF}@gmail.com`)).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
  });

  it("rechaza enlaces vencidos y usuarios desactivados después de pedir el enlace", async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM enlaces_acceso WHERE usuario_id = ${usuarioId}`);
    await srv.solicitar(email);
    const vencido = tokenDe(enviados[0]);
    await db.update(enlacesAcceso).set({ expiraEn: new Date(Date.now() - 1000) }).where(eq(enlacesAcceso.tokenHash, hashToken(vencido)));
    await expect(srv.verificar(vencido)).rejects.toBeInstanceOf(UnauthorizedException);

    await srv.solicitar(email);
    const token = tokenDe(enviados[1]);
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, usuarioId));
    await expect(srv.verificar(token)).rejects.toBeInstanceOf(ForbiddenException);
    // Inactivo: ya no se le envían enlaces.
    await srv.solicitar(email);
    expect(enviados).toHaveLength(2);
    await db.update(usuarios).set({ activo: true }).where(eq(usuarios.id, usuarioId));
  });

  it(`limita a ${MAX_ENLACES_POR_VENTANA} enlaces por ventana`, async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM enlaces_acceso WHERE usuario_id = ${usuarioId}`);
    for (let i = 0; i < MAX_ENLACES_POR_VENTANA + 2; i++) await srv.solicitar(email);
    expect(enviados).toHaveLength(MAX_ENLACES_POR_VENTANA);
  });

  it("crea como administrador activo al correo de BOOTSTRAP_ADMIN_EMAILS en su primer ingreso", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAILS = bootstrap;
    await srv.solicitar(bootstrap);
    expect(enviados).toHaveLength(1);
    const sesion = await srv.verificar(tokenDe(enviados[0]));
    const id = verificarSesion(sesion.token)!.usuarioId;
    const ctx = await moduleRef.get(UsuariosService).contextoAcceso(id);
    expect(ctx.perfilCodigo).toBe("ADMIN");
  });

  it("en modo demo devuelve el enlace en vez de enviarlo", async () => {
    process.env.AUTH_DISABLED = "true";
    try {
      const db = drizzle(pool);
      await db.execute(sql`DELETE FROM enlaces_acceso WHERE usuario_id = ${usuarioId}`);
      const r = await srv.solicitar(email, { origen: "http://localhost:4200" });
      expect(r.enlaceDemo).toMatch(/^http:\/\/localhost:4200\/login\/verificar\?token=/);
      expect(enviados).toHaveLength(0);
    } finally {
      process.env.AUTH_DISABLED = "false";
    }
  });
});
