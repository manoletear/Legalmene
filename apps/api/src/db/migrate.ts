import "dotenv/config";
import { configPool } from "./url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool(configPool());
  const db = drizzle(pool);
  console.info("Aplicando migraciones...");
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.info("Migraciones aplicadas.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
