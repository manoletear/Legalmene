import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { accesoActual } from "../../common/acceso/contexto";
import { asc, count, eq, inArray } from "drizzle-orm";
import {
  PERFIL_ADMIN,
  permisosDePerfil,
  type CreatePerfil,
  type Perfil,
  type Permiso,
  type UpdatePerfil,
} from "@legalmene/shared";
import { DRIZZLE, Database } from "../../db/database.module";
import { perfiles, perfilPermisos, usuarios, PerfilRow } from "../../db/schema/usuarios";

@Injectable()
export class PerfilesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async permisosDe(ids: string[]): Promise<Map<string, string[]>> {
    const mapa = new Map<string, string[]>();
    if (ids.length === 0) return mapa;
    const rows = await this.db.select().from(perfilPermisos).where(inArray(perfilPermisos.perfilId, ids));
    for (const r of rows) mapa.set(r.perfilId, [...(mapa.get(r.perfilId) ?? []), r.permiso]);
    return mapa;
  }

  private aDto(p: PerfilRow, permisos: string[], usuariosN?: number): Perfil {
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      vigente: p.vigente,
      esSistema: p.esSistema,
      permisos: permisosDePerfil(p.codigo, permisos),
      usuarios: usuariosN,
    };
  }

  async listar(): Promise<Perfil[]> {
    const rows = await this.db.select().from(perfiles).orderBy(asc(perfiles.nombre));
    const [permisos, conteos] = await Promise.all([
      this.permisosDe(rows.map((r) => r.id)),
      this.db.select({ perfilId: usuarios.perfilId, n: count() }).from(usuarios).groupBy(usuarios.perfilId),
    ]);
    const n = new Map(conteos.map((c) => [c.perfilId, Number(c.n)]));
    return rows.map((r) => this.aDto(r, permisos.get(r.id) ?? [], n.get(r.id) ?? 0));
  }

  async obtener(id: string): Promise<Perfil> {
    const [row] = await this.db.select().from(perfiles).where(eq(perfiles.id, id));
    if (!row) throw new NotFoundException(`Perfil ${id} no existe`);
    return this.aDto(row, (await this.permisosDe([id])).get(id) ?? []);
  }

  // Quien administra perfiles no puede otorgar permisos que no tiene: si no, podría
  // agregarse cualquier permiso (p. ej. usuarios.administrar) y escalar a ADMIN.
  private async asegurarPuedeOtorgar(perfilId: string, permisos: readonly Permiso[]): Promise<void> {
    const acceso = accesoActual();
    if (!acceso) return; // proceso del sistema (seed, migraciones)
    const actuales = new Set(
      (await this.db.select({ permiso: perfilPermisos.permiso }).from(perfilPermisos).where(eq(perfilPermisos.perfilId, perfilId))).map(
        (r) => r.permiso,
      ),
    );
    // Solo cuentan los permisos que se agregan; quitar o mantener los existentes siempre se puede.
    const faltan = permisos.filter((p) => !actuales.has(p) && !acceso.permisos.has(p));
    if (faltan.length > 0) {
      throw new ForbiddenException(`No puede otorgar permisos que usted no tiene: ${faltan.join(", ")}`);
    }
  }

  private async guardarPermisos(perfilId: string, permisos: readonly Permiso[]): Promise<void> {
    await this.asegurarPuedeOtorgar(perfilId, permisos);
    await this.db.transaction(async (tx) => {
      await tx.delete(perfilPermisos).where(eq(perfilPermisos.perfilId, perfilId));
      const unicos = [...new Set(permisos)];
      if (unicos.length > 0) await tx.insert(perfilPermisos).values(unicos.map((permiso) => ({ perfilId, permiso })));
    });
  }

  async crear(input: CreatePerfil): Promise<Perfil> {
    let permisos: Permiso[] = input.permisos;
    if (input.copiarDe && permisos.length === 0) permisos = (await this.obtener(input.copiarDe)).permisos;
    const [existe] = await this.db.select({ id: perfiles.id }).from(perfiles).where(eq(perfiles.codigo, input.codigo));
    if (existe) throw new ConflictException(`Ya existe un perfil con código ${input.codigo}`);
    const [row] = await this.db
      .insert(perfiles)
      .values({ codigo: input.codigo, nombre: input.nombre, descripcion: input.descripcion ?? null })
      .returning();
    await this.guardarPermisos(row.id, permisos);
    return this.obtener(row.id);
  }

  async actualizar(id: string, patch: UpdatePerfil): Promise<Perfil> {
    const actual = await this.obtener(id);
    if (actual.codigo === PERFIL_ADMIN) {
      if (patch.vigente === false) throw new BadRequestException("El perfil Administrador del sistema no se puede desactivar");
      if (patch.permisos) throw new BadRequestException("El perfil Administrador del sistema siempre tiene todos los permisos");
    }
    const { permisos, ...datos } = patch;
    if (Object.keys(datos).length > 0) {
      await this.db.update(perfiles).set({ ...datos, updatedAt: new Date() }).where(eq(perfiles.id, id));
    }
    if (permisos) await this.guardarPermisos(id, permisos);
    return this.obtener(id);
  }

  async eliminar(id: string): Promise<void> {
    const p = await this.obtener(id);
    if (p.esSistema) throw new BadRequestException("Los perfiles del sistema no se eliminan; puede desactivarlos");
    const [{ n }] = await this.db.select({ n: count() }).from(usuarios).where(eq(usuarios.perfilId, id));
    if (Number(n) > 0) throw new ConflictException("El perfil tiene usuarios asignados; reasígnelos antes de eliminarlo");
    await this.db.delete(perfiles).where(eq(perfiles.id, id));
  }
}
