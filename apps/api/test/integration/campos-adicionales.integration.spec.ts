import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { atenciones } from "../../src/db/schema/atenciones";
import { CamposAdicionalesService } from "../../src/modules/campos-adicionales/campos-adicionales.service";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("Campos adicionales por materia o procedimiento (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  let service: CamposAdicionalesService;
  const PLAN = planAleatorio("CA");
  let cm: MateriaPrueba;
  let afiliadoId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [CamposAdicionalesService],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    service = moduleRef.get(CamposAdicionalesService);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    const [a] = await db.insert(afiliados).values({ rut: rutAleatorio(), nombres: "Campo", apellidoPaterno: "Adicional" }).returning();
    afiliadoId = a.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM campos_adicionales WHERE materia_id = ${cm.materiaId}`);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("solo aplican los campos de la materia y el tipo; valida tipos y obligatorios", async () => {
    const db = drizzle(pool);
    const cuantia = await service.crear({ etiqueta: "Cuantía", tipoDato: "Numero", obligatorio: true, materiaId: cm.materiaId, tipoAtencion: "Juicio", orden: 1 });
    const moneda = await service.crear({ etiqueta: "Moneda", tipoDato: "Opcion", opciones: ["CLP", "UF", "UTM"], obligatorio: false, materiaId: cm.materiaId, orden: 0 });
    await service.crear({ etiqueta: "Solo asesorías", tipoDato: "Texto", obligatorio: false, materiaId: cm.materiaId, tipoAtencion: "Asesoria", orden: 2 });
    const [j] = await db
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `TEST-CA-${PLAN}`, afiliadoId, tipo: "Juicio", estado: "EnGestion", ...cm, asunto: "Campos" })
      .returning();

    const { campos } = await service.deAtencion(j.id);
    expect(campos.map((c) => c.etiqueta)).toEqual(["Moneda", "Cuantía"]);
    await expect(service.guardar(j.id, { [moneda.id]: "USD" })).rejects.toThrow(/opción no válida/);
    await expect(service.guardar(j.id, { [moneda.id]: "UF" })).rejects.toThrow(/Cuantía es obligatorio/);
    await expect(service.guardar(j.id, { [cuantia.id]: "mucho" })).rejects.toThrow(/número/);
    const r = await service.guardar(j.id, { [moneda.id]: "UF", [cuantia.id]: "1500,5" });
    expect(r.valores).toEqual({ [moneda.id]: "UF", [cuantia.id]: 1500.5 });

    // Desactivado: deja de aplicar, pero el valor registrado se conserva.
    await service.actualizar(moneda.id, { vigente: false });
    const despues = await service.deAtencion(j.id);
    expect(despues.campos.map((c) => c.etiqueta)).toEqual(["Cuantía"]);
    expect(despues.valores[moneda.id]).toBe("UF");
    await expect(service.guardar(j.id, { [moneda.id]: "CLP" })).rejects.toThrow(/no aplican/);

    await db.execute(sql`UPDATE atenciones SET estado = 'Terminada' WHERE id = ${j.id}`);
    await expect(service.guardar(j.id, { [cuantia.id]: 1 })).rejects.toThrow(/terminada/);
  });
});
