import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { MaestrosService } from "../../src/modules/maestros/maestros.service";

const RUN = !!process.env.DATABASE_URL;

// Canales y territorio (Anexo §II l.150) como maestros administrables.
(RUN ? describe : describe.skip)("Maestros: canales y territorio (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let maestros: MaestrosService;
  const SUF = Math.random().toString(36).slice(2, 8);
  const creados: { tabla: string; id: string }[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [MaestrosService],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    maestros = moduleRef.get(MaestrosService);
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle/migrations" });
  });

  afterAll(async () => {
    const db = drizzle(pool);
    for (const c of creados.reverse()) await db.execute(sql`DELETE FROM ${sql.identifier(c.tabla)} WHERE id = ${c.id}`);
    await moduleRef.close();
  });

  it("canales: se crean, renombran y desactivan; el nombre es único", async () => {
    const canal = (await maestros.crear("canales", { nombre: `Canal ${SUF}` })) as { id: string; vigente: boolean };
    creados.push({ tabla: "canales", id: canal.id });
    expect(canal.vigente).toBe(true);
    const editado = (await maestros.actualizar("canales", canal.id, { nombre: `Canal ${SUF} bis`, vigente: false })) as { nombre: string; vigente: boolean };
    expect(editado).toMatchObject({ nombre: `Canal ${SUF} bis`, vigente: false });
    await expect(maestros.crear("canales", { nombre: `Canal ${SUF} bis` })).rejects.toBeInstanceOf(ConflictException);
  });

  it("regiones precargadas; ciudades y comunas cuelgan de una región existente", async () => {
    const regiones = (await maestros.listar("regiones")) as { id: string; nombre: string }[];
    expect(regiones.map((r) => r.nombre)).toEqual(expect.arrayContaining(["Metropolitana de Santiago", "Ñuble", "Arica y Parinacota"]));
    const region = (await maestros.crear("regiones", { nombre: `Región ${SUF}` })) as { id: string };
    creados.push({ tabla: "regiones", id: region.id });
    const comuna = (await maestros.crear("comunas", { regionId: region.id, nombre: `Comuna ${SUF}` })) as { id: string };
    creados.push({ tabla: "comunas", id: comuna.id });
    const ciudad = (await maestros.crear("ciudades", { regionId: region.id, nombre: `Ciudad ${SUF}` })) as { id: string };
    creados.push({ tabla: "ciudades", id: ciudad.id });

    const comunas = (await maestros.listar("comunas", { regionId: region.id })) as { nombre: string }[];
    expect(comunas.map((c) => c.nombre)).toEqual([`Comuna ${SUF}`]);
    await expect(maestros.crear("comunas", { regionId: "00000000-0000-4000-8000-000000000000", nombre: "X" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(maestros.crear("comunas", { nombre: "Sin región" })).rejects.toBeInstanceOf(BadRequestException);
  });
});
