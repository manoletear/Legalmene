import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { configPool, urlBaseDatos } from "./url";

const de = (env: Record<string, string>) => (k: string) => env[k];

describe("urlBaseDatos", () => {
  it("usa DATABASE_URL si existe", () => {
    expect(urlBaseDatos(de({ DATABASE_URL: "postgresql://a@b/c", DB_HOST: "x" }))).toBe("postgresql://a@b/c");
  });

  it("arma la URL con las partes que entrega ECS, escapando usuario y clave", () => {
    expect(
      urlBaseDatos(de({ DB_HOST: "aurora.local", DB_PORT: "5433", DB_USERNAME: "app", DB_PASSWORD: "p@ss/word", DB_NAME: "legalmene" })),
    ).toBe("postgresql://app:p%40ss%2Fword@aurora.local:5433/legalmene");
  });

  it("puerto 5432 por defecto y sslmode opcional", () => {
    expect(urlBaseDatos(de({ DB_HOST: "h", DB_USERNAME: "u", DB_PASSWORD: "p", DB_NAME: "d", DB_SSLMODE: "require" }))).toBe(
      "postgresql://u:p@h:5432/d?sslmode=require",
    );
  });

  it("sin datos falla con un mensaje claro", () => {
    expect(() => urlBaseDatos(de({ DB_HOST: "h" }))).toThrow(/DATABASE_URL no configurada/);
  });

  it("con DB_SSL_CA activa TLS verificando el certificado", () => {
    const ca = join(mkdtempSync(join(tmpdir(), "ca-")), "rds.pem");
    writeFileSync(ca, "-----CERT-----");
    expect(configPool(de({ DATABASE_URL: "postgresql://a@b/c", DB_SSL_CA: ca }))).toEqual({
      connectionString: "postgresql://a@b/c",
      ssl: { ca: "-----CERT-----", rejectUnauthorized: true },
    });
    expect(configPool(de({ DATABASE_URL: "postgresql://a@b/c" }))).toEqual({ connectionString: "postgresql://a@b/c" });
  });
});
