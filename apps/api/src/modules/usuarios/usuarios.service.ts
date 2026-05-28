import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { DRIZZLE, Database } from "../../db/database.module";
import { usuarios, Usuario } from "../../db/schema/usuarios";

export interface ClaimsSpec {
  entraOid: string;
  email: string;
  nombre: string;
  rol: "Administrador" | "Supervisor" | "Abogado" | "Operador" | "Auditor";
  codPlanes?: string[];
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
