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
import { NotasService } from "../../src/modules/atenciones/notas.service";
import { NotifInboxService } from "../../src/modules/notif-inbox/notif-inbox.service";
import { borrarAtencionesDePlan, borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, usuarioDePrueba, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

(RUN ? describe : describe.skip)("Notas de la atención (integration)", () => {
  let moduleRef: TestingModule;
  let pool: Pool;
  const PLAN = planAleatorio("NO");
  let cm: MateriaPrueba;
  let afiliadoId: string;
  const usuarios: string[] = [];
  const avisos: { usuarioId: string; titulo: string }[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [NotasService, { provide: NotifInboxService, useValue: { crear: async (n: { usuarioId: string; titulo: string }) => avisos.push(n) } }],
    }).compile();
    pool = moduleRef.get(PG_POOL);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: `Test ${PLAN}` });
    cm = await materiaDePrueba(db);
    const [a] = await db.insert(afiliados).values({ rut: rutAleatorio(), nombres: "Nota", apellidoPaterno: "Test" }).returning();
    afiliadoId = a.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await borrarAtencionesDePlan(db, PLAN);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    for (const id of usuarios) await db.execute(sql`DELETE FROM usuarios WHERE id = ${id}`);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await borrarMateriaDePrueba(db, cm);
    await moduleRef.close();
  });

  it("el tramitador deja una nota y se avisa al abogado asignado", async () => {
    const db = drizzle(pool);
    const abogado = await usuarioDePrueba(db, "ABOGADO");
    const tramitador = await usuarioDePrueba(db, "TRAMITADOR");
    usuarios.push(abogado.id, tramitador.id);
    const [at] = await db
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `TEST-NO-${PLAN}`, afiliadoId, tipo: "Juicio", estado: "EnGestion", ...cm, asunto: "Notas", abogadoAsignadoId: abogado.id })
      .returning();
    const srv = moduleRef.get(NotasService);
    const n = await srv.crear(at.id, tramitador.id, { texto: "Llegó la notificación del tribunal" });
    expect(n).toMatchObject({ destinatarioId: abogado.id, texto: "Llegó la notificación del tribunal" });
    expect(avisos.map((x) => x.usuarioId)).toEqual([abogado.id]);
    expect((await srv.listar(at.id)).length).toBe(1);
  });
});
