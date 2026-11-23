import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { aliasedTable, and, count, eq, ilike, ne, or, sql } from "drizzle-orm";
import {
  PERFIL_ADMIN,
  PERFIL_POR_DEFECTO,
  permisosDePerfil,
  type CreateUsuarioAdmin,
  type UpdateUsuarioAdmin,
  type UsuarioActual,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { perfiles, perfilPermisos, usuarios, Usuario } from "../../db/schema/usuarios";
import type { AuthenticatedUser } from "../../common/decorators/current-user.decorator";
import { dominioPermitido } from "../auth/dominio";

// entraOid de un usuario que aún no ingresa con Microsoft (alta por enlace o desde Administración).
// En su primer ingreso con Entra ID se reemplaza por el oid real (ver resolveByEntraOid).
export const PREFIJO_OID_PENDIENTE = "enlace:";

// BOOTSTRAP_ADMIN_EMAILS: correos exactos o dominios completos con "@" inicial
// (p. ej. "ana@legalchile.cl,@tooxs.com"). Quien calce entra como Administrador activo en su
// primer ingreso. Un dominio da ADMIN a cualquier buzón de ese dominio: usarlo solo con
// dominios de confianza.
export function esAdminBootstrap(email: string, config = process.env.BOOTSTRAP_ADMIN_EMAILS): boolean {
  const correo = email.trim().toLowerCase();
  const arroba = correo.lastIndexOf("@");
  if (arroba <= 0) return false;
  const dominio = correo.slice(arroba);
  const lista = (config ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return lista.some((e) => (e.startsWith("@") ? e === dominio : e === correo));
}

export interface ClaimsSpec {
  entraOid: string;
  email: string;
  nombre: string;
}

// Modo desarrollo (AUTH_DISABLED): el header X-Dev-User puede fijar el perfil por código.
export interface ClaimsDev extends ClaimsSpec {
  perfil?: string;
}

export interface FiltroUsuarios {
  page?: number;
  pageSize?: number;
  q?: string;
  perfilId?: string;
  activo?: boolean;
}

export class UsuarioNoHabilitadoError extends Error {
  constructor(
    message: string,
    readonly usuario: Pick<Usuario, "id" | "email">,
  ) {
    super(message);
  }
}

const jefes = aliasedTable(usuarios, "jefes");

@Injectable()
export class UsuariosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async obtenerPorId(id: string): Promise<Usuario | null> {
    const [row] = await this.db.select().from(usuarios).where(eq(usuarios.id, id));
    return row ?? null;
  }

  private async perfilIdPorCodigo(codigo: string): Promise<string> {
    const [p] = await this.db.select({ id: perfiles.id }).from(perfiles).where(eq(perfiles.codigo, codigo));
    if (!p) throw new BadRequestException(`Perfil ${codigo} no existe`);
    return p.id;
  }

  // Usuario + perfil + permisos efectivos. Lanza si el usuario no puede operar.
  async contextoAcceso(id: string): Promise<AuthenticatedUser> {
    const [row] = await this.db
      .select({
        usuario: usuarios,
        perfilCodigo: perfiles.codigo,
        perfilNombre: perfiles.nombre,
        perfilVigente: perfiles.vigente,
      })
      .from(usuarios)
      .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
      .where(eq(usuarios.id, id));
    if (!row) throw new NotFoundException(`Usuario ${id} no existe`);
    const u = row.usuario;
    if (!u.activo) {
      throw new UsuarioNoHabilitadoError("Su usuario no está habilitado. Solicite acceso al administrador del sistema.", u);
    }
    if (u.bloqueado) {
      throw new UsuarioNoHabilitadoError(
        `Su usuario está bloqueado${u.motivoBloqueo ? `: ${u.motivoBloqueo}` : ""}. Contacte al administrador.`,
        u,
      );
    }
    if (!row.perfilVigente && row.perfilCodigo !== PERFIL_ADMIN) {
      throw new UsuarioNoHabilitadoError("Su perfil está desactivado. Contacte al administrador.", u);
    }
    const asignados = await this.db
      .select({ permiso: perfilPermisos.permiso })
      .from(perfilPermisos)
      .where(eq(perfilPermisos.perfilId, u.perfilId));
    return {
      id: u.id,
      entraOid: u.entraOid,
      email: u.email,
      nombre: u.nombre,
      perfilId: u.perfilId,
      perfilCodigo: row.perfilCodigo,
      perfilNombre: row.perfilNombre,
      permisos: permisosDePerfil(row.perfilCodigo, asignados.map((a) => a.permiso)),
      sesionVersion: u.sesionVersion,
    };
  }

  // Cierra todas las sesiones del usuario (logout): las emitidas antes dejan de valer.
  async revocarSesiones(id: string): Promise<void> {
    await this.db
      .update(usuarios)
      .set({ sesionVersion: sql`${usuarios.sesionVersion} + 1`, updatedAt: new Date() })
      .where(eq(usuarios.id, id));
  }

  async actual(user: AuthenticatedUser): Promise<UsuarioActual> {
    const u = await this.obtenerPorId(user.id);
    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      anexo: u?.anexo ?? null,
      perfil: { id: user.perfilId, codigo: user.perfilCodigo, nombre: user.perfilNombre },
      permisos: user.permisos,
    };
  }

  async listar(filtro: FiltroUsuarios) {
    const page = filtro.page ?? 1;
    const pageSize = Math.min(filtro.pageSize ?? 25, 200);
    const where = and(
      filtro.q
        ? or(ilike(usuarios.email, `%${filtro.q}%`), ilike(usuarios.nombre, `%${filtro.q}%`), ilike(usuarios.cargo, `%${filtro.q}%`))
        : undefined,
      filtro.perfilId ? eq(usuarios.perfilId, filtro.perfilId) : undefined,
      typeof filtro.activo === "boolean" ? eq(usuarios.activo, filtro.activo) : undefined,
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: usuarios.id,
          entraOid: usuarios.entraOid,
          email: usuarios.email,
          nombre: usuarios.nombre,
          cargo: usuarios.cargo,
          perfilId: usuarios.perfilId,
          jefeId: usuarios.jefeId,
          anexo: usuarios.anexo,
          activo: usuarios.activo,
          bloqueado: usuarios.bloqueado,
          motivoBloqueo: usuarios.motivoBloqueo,
          ultimoLogin: usuarios.ultimoLogin,
          createdAt: usuarios.createdAt,
          updatedAt: usuarios.updatedAt,
          perfilCodigo: perfiles.codigo,
          perfilNombre: perfiles.nombre,
          jefeNombre: jefes.nombre,
        })
        .from(usuarios)
        .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
        .leftJoin(jefes, eq(jefes.id, usuarios.jefeId))
        .where(where)
        .orderBy(usuarios.nombre)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ value: count() }).from(usuarios).where(where),
    ]);
    return {
      data: rows,
      page,
      pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
    };
  }

  // Siempre debe quedar al menos un administrador activo y desbloqueado.
  private async asegurarOtroAdmin(usuarioId: string): Promise<void> {
    const [row] = await this.db
      .select({ n: count() })
      .from(usuarios)
      .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
      .where(
        and(
          eq(perfiles.codigo, PERFIL_ADMIN),
          eq(usuarios.activo, true),
          eq(usuarios.bloqueado, false),
          ne(usuarios.id, usuarioId),
        ),
      );
    if (Number(row?.n ?? 0) === 0) {
      throw new ConflictException("Debe quedar al menos un Administrador del sistema activo");
    }
  }

  private async esAdmin(u: Usuario): Promise<boolean> {
    const [p] = await this.db.select({ codigo: perfiles.codigo }).from(perfiles).where(eq(perfiles.id, u.perfilId));
    return p?.codigo === PERFIL_ADMIN;
  }

  async actualizarPorAdmin(id: string, patch: UpdateUsuarioAdmin, actorId: string): Promise<Usuario> {
    const actual = await this.obtenerPorId(id);
    if (!actual) throw new NotFoundException(`Usuario ${id} no existe`);
    if (patch.jefeId === id) throw new BadRequestException("Un usuario no puede ser su propio jefe");
    if (patch.jefeId) {
      const jefe = await this.obtenerPorId(patch.jefeId);
      if (!jefe) throw new BadRequestException(`Jefe ${patch.jefeId} no existe`);
    }
    if (patch.perfilId) await this.validarPerfil(patch.perfilId);
    const quitaAdmin =
      (await this.esAdmin(actual)) &&
      ((patch.perfilId !== undefined && patch.perfilId !== actual.perfilId) || patch.activo === false);
    if (quitaAdmin) {
      if (id === actorId) throw new ConflictException("No puede quitarse a sí mismo el perfil de administrador");
      await this.asegurarOtroAdmin(id);
    }
    if (patch.activo === false && id === actorId) throw new ConflictException("No puede desactivar su propio usuario");
    if (patch.perfilId && patch.perfilId !== actual.perfilId) {
      // Delegación acotada: nadie cambia su propio perfil ni asigna permisos que no tiene
      // (si no, usuarios.administrar bastaría para asignarse ADMIN).
      if (id === actorId) throw new ForbiddenException("No puede cambiar su propio perfil");
      await this.asegurarPuedeAsignar(patch.perfilId, actorId);
    }

    const [row] = await this.db
      .update(usuarios)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(usuarios.id, id))
      .returning();
    return row;
  }

  private async validarPerfil(perfilId: string): Promise<void> {
    const [p] = await this.db.select().from(perfiles).where(eq(perfiles.id, perfilId));
    if (!p) throw new BadRequestException(`Perfil ${perfilId} no existe`);
    if (!p.vigente) throw new BadRequestException(`El perfil ${p.nombre} está desactivado`);
  }

  // Delegación acotada: quien no es ADMIN solo asigna perfiles cuyos permisos ya tiene.
  private async asegurarPuedeAsignar(perfilId: string, actorId: string): Promise<void> {
    const actor = await this.contextoAcceso(actorId);
    if (actor.perfilCodigo === PERFIL_ADMIN) return;
    const [destino] = await this.db.select({ codigo: perfiles.codigo }).from(perfiles).where(eq(perfiles.id, perfilId));
    const asignados = await this.db
      .select({ permiso: perfilPermisos.permiso })
      .from(perfilPermisos)
      .where(eq(perfilPermisos.perfilId, perfilId));
    const otorga = permisosDePerfil(destino.codigo, asignados.map((a) => a.permiso));
    if (otorga.some((x) => !actor.permisos.includes(x))) {
      throw new ForbiddenException("No puede asignar un perfil con permisos que usted no tiene");
    }
  }

  // Alta desde Administración (Anexo §II l.106). Queda activo y entra con enlace de acceso a su
  // correo; si luego ingresa con Microsoft, resolveByEntraOid lo vincula por correo.
  async crearPorAdmin(input: CreateUsuarioAdmin, actorId: string): Promise<Usuario> {
    const email = input.email.trim().toLowerCase();
    if (!dominioPermitido(email) && !esAdminBootstrap(email)) {
      throw new BadRequestException("El correo no pertenece a un dominio habilitado para ingresar");
    }
    await this.validarPerfil(input.perfilId);
    await this.asegurarPuedeAsignar(input.perfilId, actorId);
    if (input.jefeId && !(await this.obtenerPorId(input.jefeId))) {
      throw new BadRequestException(`Jefe ${input.jefeId} no existe`);
    }
    const [row] = await this.db
      .insert(usuarios)
      .values({
        entraOid: `${PREFIJO_OID_PENDIENTE}${email}`,
        email,
        nombre: input.nombre,
        cargo: input.cargo || null,
        perfilId: input.perfilId,
        jefeId: input.jefeId ?? null,
        anexo: input.anexo || null,
        activo: true,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new ConflictException(`Ya existe un usuario con el correo ${email}`);
    return row;
  }

  async bloquear(id: string, bloqueado: boolean, motivo: string | undefined, actorId: string): Promise<Usuario> {
    const actual = await this.obtenerPorId(id);
    if (!actual) throw new NotFoundException(`Usuario ${id} no existe`);
    if (bloqueado) {
      if (id === actorId) throw new ConflictException("No puede bloquear su propio usuario");
      if (await this.esAdmin(actual)) await this.asegurarOtroAdmin(id);
    }
    const [row] = await this.db
      .update(usuarios)
      .set({ bloqueado, motivoBloqueo: bloqueado ? (motivo ?? null) : null, updatedAt: new Date() })
      .where(eq(usuarios.id, id))
      .returning();
    return row;
  }

  // Login con Entra ID: un usuario nuevo queda inactivo hasta que un administrador lo
  // habilite (el perfil por defecto ve atenciones). Los correos de BOOTSTRAP_ADMIN_EMAILS
  // entran como administradores activos para poder hacer la primera habilitación.
  // El perfil lo administra la aplicación y nunca se sobrescribe desde el token.
  async resolveByEntraOid(claims: ClaimsSpec): Promise<Usuario> {
    // Un usuario creado antes de su primer ingreso con Microsoft se vincula por correo, una sola
    // vez: solo si su entraOid sigue pendiente (nunca se reasigna un oid real).
    await this.db
      .update(usuarios)
      .set({ entraOid: claims.entraOid, updatedAt: new Date() })
      .where(and(eq(usuarios.email, claims.email.trim().toLowerCase()), sql`${usuarios.entraOid} like ${PREFIJO_OID_PENDIENTE + "%"}`));
    const esBootstrap = esAdminBootstrap(claims.email);
    const perfilId = await this.perfilIdPorCodigo(esBootstrap ? PERFIL_ADMIN : PERFIL_POR_DEFECTO);
    const [row] = await this.db
      .insert(usuarios)
      .values({ ...claims, perfilId, activo: esBootstrap, ultimoLogin: new Date() })
      .onConflictDoUpdate({
        target: usuarios.entraOid,
        set: {
          email: sql`excluded.email`,
          nombre: sql`excluded.nombre`,
          ultimoLogin: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  // Solo AUTH_DISABLED: permite impersonar perfiles en desarrollo y E2E.
  async resolveDev(claims: ClaimsDev): Promise<Usuario> {
    const codigo = claims.perfil;
    if (!codigo) return this.resolveByEntraOid(claims);
    const perfilId = await this.perfilIdPorCodigo(codigo);
    const [row] = await this.db
      .insert(usuarios)
      .values({ entraOid: claims.entraOid, email: claims.email, nombre: claims.nombre, perfilId, ultimoLogin: new Date() })
      .onConflictDoUpdate({
        target: usuarios.entraOid,
        set: { email: sql`excluded.email`, nombre: sql`excluded.nombre`, perfilId, ultimoLogin: new Date(), updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  // Listado mínimo para selects (jefe, abogado asignado).
  async opciones() {
    return this.db
      .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, perfilCodigo: perfiles.codigo })
      .from(usuarios)
      .innerJoin(perfiles, eq(perfiles.id, usuarios.perfilId))
      .where(and(eq(usuarios.activo, true), eq(usuarios.bloqueado, false)))
      .orderBy(usuarios.nombre);
  }
}
