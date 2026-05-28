import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  console.log("Aplicando migraciones...");
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Migraciones aplicadas.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
