import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://legalmene:legalmene@localhost:5432/legalmene",
  },
  strict: true,
  verbose: true,
});
