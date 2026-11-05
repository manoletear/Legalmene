import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { inArray } from "drizzle-orm";
import { canales, planes } from "./schema/planes";
import { usuarios } from "./schema/usuarios";
import { afiliados, planesAfiliado } from "./schema/afiliados";
import { aranceles, valoresUf } from "./schema/aranceles";

// UF real del día desde mindicador.cl; si falla se deja sin UF (la UI lo indica).
async function ufDelDia(): Promise<{ fecha: string; valorCentavos: number } | null> {
  try {
    const res = await fetch("https://mindicador.cl/api/uf", { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { serie?: { fecha: string; valor: number }[] };
    const ultimo = body.serie?.[0];
    if (!ultimo) return null;
    return { fecha: ultimo.fecha.slice(0, 10), valorCentavos: Math.round(ultimo.valor * 100) };
  } catch {
    return null;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  console.info("Insertando datos demo...");

  await db
    .insert(canales)
    .values([{ nombre: "Directo" }, { nombre: "Corredora de seguros" }, { nombre: "Convenio empresa" }])
    .onConflictDoNothing();
  const canalPorNombre = new Map(
    (await db.select().from(canales)).map((c) => [c.nombre, c.id] as const),
  );

  await db
    .insert(planes)
    .values([
      {
        codPlan: "DEMO",
        nombre: "Plan Demo",
        descripcion: "Plan para pruebas",
        canalId: canalPorNombre.get("Directo"),
        vigente: true,
      },
      {
        codPlan: "EMP01",
        nombre: "Empresa Uno",
        canalId: canalPorNombre.get("Convenio empresa"),
        vigente: true,
      },
      // Planes especiales para RUT sin plan vigente (Anexo §VI 3.1).
      { codPlan: "REZAGADO", nombre: "Rezagado (sin plan vigente)", vigente: true },
      { codPlan: "METLIFE", nombre: "Seguro complementario MetLife", vigente: true },
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
        rut: "11111111-1",
        nombres: "Juan",
        apellidoPaterno: "Pérez",
        apellidoMaterno: "Soto",
        email: "juan.perez@example.cl",
        telefono: "+56912345678",
      },
      {
        rut: "22222222-2",
        nombres: "María",
        apellidoPaterno: "González",
        email: "maria.gonzalez@example.cl",
      },
      // Afiliado sin plan vigente: sus atenciones van como REZAGADO.
      {
        rut: "33333333-3",
        nombres: "Pedro",
        apellidoPaterno: "Rojas",
        email: "pedro.rojas@example.cl",
      },
    ])
    .onConflictDoNothing();

  const personas = await db
    .select({ id: afiliados.id, rut: afiliados.rut })
    .from(afiliados)
    .where(inArray(afiliados.rut, ["11111111-1", "22222222-2", "33333333-3"]));
  const idPorRut = new Map(personas.map((p) => [p.rut, p.id] as const));
  await db
    .insert(planesAfiliado)
    .values([
      { afiliadoId: idPorRut.get("11111111-1")!, codPlan: "DEMO", fechaInicio: "2024-01-01" },
      { afiliadoId: idPorRut.get("11111111-1")!, codPlan: "EMP01", fechaInicio: "2025-03-01" },
      { afiliadoId: idPorRut.get("22222222-2")!, codPlan: "DEMO", fechaInicio: "2024-06-01" },
      {
        afiliadoId: idPorRut.get("33333333-3")!,
        codPlan: "EMP01",
        fechaInicio: "2023-01-01",
        fechaTermino: "2024-12-31",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(aranceles)
    .values([
      { codPlan: "DEMO", codigo: "A-LAB-01", descripcion: "Juicio por despido injustificado", competencia: "Laboral", tipo: "Juicio", valorUfCentesimas: 1200 },
      { codPlan: "DEMO", codigo: "A-LAB-02", descripcion: "Consulta laboral", competencia: "Laboral", tipo: "Consulta", valorUfCentesimas: 100 },
      { codPlan: "DEMO", codigo: "A-CIV-01", descripcion: "Juicio ejecutivo de cobro", competencia: "Civil", tipo: "Juicio", valorUfCentesimas: 1500 },
      { codPlan: "DEMO", codigo: "A-CIV-02", descripcion: "Asesoría contractual", competencia: "Civil", tipo: "Asesoria", valorUfCentesimas: 300 },
      { codPlan: "DEMO", codigo: "A-FAM-01", descripcion: "Demanda de alimentos", competencia: "Familia", tipo: "Juicio", valorUfCentesimas: 800 },
    ])
    .onConflictDoNothing();

  const uf = await ufDelDia();
  if (uf) {
    await db.insert(valoresUf).values(uf).onConflictDoNothing();
    console.info(`UF ${uf.fecha}: ${uf.valorCentavos / 100}`);
  } else {
    console.warn("No se pudo obtener la UF; los aranceles se mostrarán sin valor en pesos.");
  }

  console.info("Seed completado. Admin:", admin?.email ?? "(ya existía)");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
