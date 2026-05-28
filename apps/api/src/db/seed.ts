import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { planes } from "./schema/planes";
import { usuarios } from "./schema/usuarios";
import { afiliados } from "./schema/afiliados";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  console.log("Insertando datos demo...");

  await db
    .insert(planes)
    .values([
      { codPlan: "DEMO", nombre: "Plan Demo", descripcion: "Plan para pruebas", vigente: true },
      { codPlan: "EMP01", nombre: "Empresa Uno", vigente: true },
    ])
    .onConflictDoNothing();

  const [admin] = await db
    .insert(usuarios)
    .values({
      entraOid: "00000000-0000-0000-0000-000000000001",
      email: "admin@legalchile.cl",
      nombre: "Admin Demo",
      rol: "Administrador",
      codPlanes: ["DEMO", "EMP01"],
    })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(usuarios)
    .values({
      entraOid: "00000000-0000-0000-0000-000000000002",
      email: "abogado@legalchile.cl",
      nombre: "Abogado Demo",
      rol: "Abogado",
      codPlanes: ["DEMO"],
    })
    .onConflictDoNothing();

  await db
    .insert(afiliados)
    .values([
      {
        codPlan: "DEMO",
        rut: "11111111-1",
        nombres: "Juan",
        apellidoPaterno: "Pérez",
        apellidoMaterno: "Soto",
        email: "juan.perez@example.cl",
        telefono: "+56912345678",
      },
      {
        codPlan: "DEMO",
        rut: "22222222-2",
        nombres: "María",
        apellidoPaterno: "González",
        email: "maria.gonzalez@example.cl",
      },
    ])
    .onConflictDoNothing();

  console.log("Seed completado. Admin:", admin?.email ?? "(ya existía)");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
