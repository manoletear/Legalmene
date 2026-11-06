import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { DatabaseModule, PG_POOL } from "../../src/db/database.module";
import { planes } from "../../src/db/schema/planes";
import { afiliados } from "../../src/db/schema/afiliados";
import { atenciones } from "../../src/db/schema/atenciones";
import { materias } from "../../src/db/schema/maestros";
import { ArancelesService } from "../../src/modules/aranceles/aranceles.service";
import { CoberturasService } from "../../src/modules/coberturas/coberturas.service";
import { borrarMateriaDePrueba, materiaDePrueba, planAleatorio, rutAleatorio, type MateriaPrueba } from "./helpers";

const RUN = !!process.env.DATABASE_URL;

// Aranceles por materia (comunes a todos los planes) y coberturas por plan (Anexo §I.13, §IX).
(RUN ? describe : describe.skip)("Aranceles y coberturas (integration)", () => {
  let moduleRef: TestingModule;
  let arancelesSrv: ArancelesService;
  let coberturasSrv: CoberturasService;
  let pool: Pool;
  const PLAN = planAleatorio("TC");
  const SUF = PLAN.slice(-6);
  let cm: MateriaPrueba;
  let otraMateriaId: string;
  let afiliadoId: string;
  let atencionId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [ArancelesService, CoberturasService],
    }).compile();
    arancelesSrv = moduleRef.get(ArancelesService);
    coberturasSrv = moduleRef.get(CoberturasService);
    pool = moduleRef.get(PG_POOL);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    await db.insert(planes).values({ codPlan: PLAN, nombre: PLAN });
    cm = await materiaDePrueba(db);
    const [otra] = await db
      .insert(materias)
      .values({ competenciaId: cm.competenciaId, nombre: `Otra ${SUF}` })
      .returning();
    otraMateriaId = otra.id;
    const [afi] = await db
      .insert(afiliados)
      .values({ rut: rutAleatorio(), nombres: "Test", apellidoPaterno: "Copago" })
      .returning();
    afiliadoId = afi.id;
    const [at] = await db
      .insert(atenciones)
      .values({ codPlan: PLAN, correlativo: `TEST-COB-${SUF}`, afiliadoId, tipo: "Juicio", estado: "Asignada", ...cm, asunto: "Copago" })
      .returning();
    atencionId = at.id;
  });

  afterAll(async () => {
    const db = drizzle(pool);
    await db.execute(sql`DELETE FROM atenciones WHERE id = ${atencionId}`);
    await db.execute(sql`DELETE FROM coberturas WHERE cod_plan = ${PLAN}`);
    await db.execute(sql`DELETE FROM afiliados WHERE id = ${afiliadoId}`);
    await borrarMateriaDePrueba(db, cm);
    await db.execute(sql`DELETE FROM planes WHERE cod_plan = ${PLAN}`);
    await moduleRef.close();
  });

  it("aranceles: código único y un solo arancel por materia y tipo (null = cualquier tipo)", async () => {
    const general = await arancelesSrv.crear({ materiaId: cm.materiaId, codigo: `G-${SUF}`, descripcion: "General", valorUfCentesimas: 1000 });
    expect(general.tipo).toBeNull();
    await expect(
      arancelesSrv.crear({ materiaId: cm.materiaId, codigo: `G2-${SUF}`, descripcion: "Otro general", valorUfCentesimas: 900 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      arancelesSrv.crear({ materiaId: otraMateriaId, codigo: `G-${SUF}`, descripcion: "Código repetido", valorUfCentesimas: 900 }),
    ).rejects.toBeInstanceOf(ConflictException);

    await arancelesSrv.crear({ materiaId: cm.materiaId, tipo: "Juicio", codigo: `J-${SUF}`, descripcion: "Juicio", valorUfCentesimas: 1200 });
    // El específico del tipo gana sobre el general de la materia.
    expect((await arancelesSrv.aplicable(cm.materiaId, "Juicio"))?.codigo).toBe(`J-${SUF}`);
    expect((await arancelesSrv.aplicable(cm.materiaId, "Consulta"))?.codigo).toBe(`G-${SUF}`);
    expect(await arancelesSrv.aplicable(otraMateriaId, "Juicio")).toBeNull();

    const lista = await arancelesSrv.listar({ competenciaId: cm.competenciaId });
    expect(lista.data.map((a) => a.codigo).sort()).toEqual([`G-${SUF}`, `J-${SUF}`]);
    expect(lista.data[0].materiaNombre).toMatch(/^Materia /);
  });

  it("UF vigente: nunca usa una UF de más de 7 días ni una con fecha futura", async () => {
    const dia = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const antigua = dia(-30);
    const futura = dia(30);
    const pool = moduleRef.get(PG_POOL);
    await arancelesSrv.registrarUf({ fecha: antigua, valorCentavos: 1_111_111 });
    await arancelesSrv.registrarUf({ fecha: futura, valorCentavos: 9_999_999 });
    try {
      const uf = await arancelesSrv.ufVigente();
      expect(uf?.fecha).not.toBe(antigua);
      expect(uf?.fecha).not.toBe(futura);
    } finally {
      await pool.query("DELETE FROM valores_uf WHERE fecha IN ($1, $2)", [antigua, futura]);
    }
  });

  it("coberturas: valida modalidad y rechaza reglas duplicadas del plan", async () => {
    await coberturasSrv.crear({ codPlan: PLAN, modalidad: "Porcentaje", porcentaje: 50 });
    await expect(coberturasSrv.crear({ codPlan: PLAN, modalidad: "SinCobertura" })).rejects.toBeInstanceOf(ConflictException);
    await expect(coberturasSrv.crear({ codPlan: "NO_EXISTE", modalidad: "SinCobertura" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("copago de una atención usa la regla más específica del plan", async () => {
    // Sin regla de materia: aplica la general (50 %) sobre el arancel de juicio (12 UF).
    let r = await coberturasSrv.copagoAtencion(atencionId);
    expect(r.cobertura?.porcentaje).toBe(50);
    expect(r.copagoUfCentesimas).toBe(600);

    const especifica = await coberturasSrv.crear({ codPlan: PLAN, materiaId: cm.materiaId, tipo: "Juicio", modalidad: "Porcentaje", porcentaje: 90 });
    r = await coberturasSrv.copagoAtencion(atencionId);
    expect(r.cobertura?.id).toBe(especifica.id);
    expect(r.copagoUfCentesimas).toBe(120);

    // Una regla desactivada deja de aplicar.
    await coberturasSrv.actualizar(especifica.id, { vigente: false });
    expect((await coberturasSrv.copagoAtencion(atencionId)).copagoUfCentesimas).toBe(600);

    // Precio fijo del plan para la otra materia, aunque no tenga arancel.
    await coberturasSrv.crear({ codPlan: PLAN, materiaId: otraMateriaId, modalidad: "ValorUF", valorUfCentesimas: 150 });
    const fijo = await coberturasSrv.copago(PLAN, otraMateriaId, "Consulta");
    expect(fijo.modalidad).toBe("ValorUF");
    expect(fijo.copagoUfCentesimas).toBe(150);
    expect(fijo.arancel).toBeNull();
  });
});
