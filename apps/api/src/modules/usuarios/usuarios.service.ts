import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { usuarios, Usuario } from "../../db/schema/usuarios";

export interface ClaimsSpec {
  entraOid: string;
  email: string;
  nombre: string;
  rol: "Administrador" | "Supervisor" | "Abogado" | "Operador" | "Auditor";
  codPlanes?: string[];
}

export interface FiltroUsuarios {
  page?: number;
  pageSize?: number;
  q?: string;
  rol?: ClaimsSpec["rol"];
  activo?: boolean;
}

@Injectable()
export class UsuariosService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async obtenerPorId(id: string): Promise<Usuario | null> {
    const [row] = await this.db.select().from(usuarios).where(eq(usuarios.id, id));
    return row ?? null;
  }

  async obtenerPorEmail(email: string): Promise<Usuario | null> {
    const [row] = await this.db.select().from(usuarios).where(eq(usuarios.email, email));
    return row ?? null;
  }

  async listar(filtro: FiltroUsuarios) {
    const page = filtro.page ?? 1;
    const pageSize = Math.min(filtro.pageSize ?? 25, 200);
    const where = and(
      filtro.q
        ? or(ilike(usuarios.email, `%${filtro.q}%`), ilike(usuarios.nombre, `%${filtro.q}%`))
        : undefined,
      filtro.rol ? eq(usuarios.rol, filtro.rol) : undefined,
      typeof filtro.activo === "boolean" ? eq(usuarios.activo, filtro.activo) : undefined,
    );
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select()
        .from(usuarios)
        .where(where)
        .orderBy(desc(usuarios.updatedAt))
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

  async actualizarPorAdmin(
    id: string,
    patch: { rol?: ClaimsSpec["rol"]; activo?: boolean; codPlanes?: string[] },
  ): Promise<Usuario> {
    const [row] = await this.db
      .update(usuarios)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(usuarios.id, id))
      .returning();
    if (!row) throw new NotFoundException(`Usuario ${id} no existe`);
    return row;
  }

  // Crea o actualiza el usuario en cada login basándose en claims del IdP.
  // Mantiene email/nombre/rol sincronizados con Entra ID.
  async resolveByEntraOid(claims: ClaimsSpec): Promise<Usuario> {
    const [row] = await this.db
      .insert(usuarios)
      .values({
        entraOid: claims.entraOid,
        email: claims.email,
        nombre: claims.nombre,
        rol: claims.rol,
        codPlanes: claims.codPlanes ?? [],
        ultimoLogin: new Date(),
      })
      .onConflictDoUpdate({
        target: usuarios.entraOid,
        set: {
          email: sql`excluded.email`,
          nombre: sql`excluded.nombre`,
          rol: sql`excluded.rol`,
          codPlanes: sql`excluded.cod_planes`,
          ultimoLogin: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }
}
