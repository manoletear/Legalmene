import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { eq, inArray } from "drizzle-orm";
import { canales, planes } from "./schema/planes";
import { perfiles, usuarios } from "./schema/usuarios";
import { afiliados, planesAfiliado } from "./schema/afiliados";
import { valoresUf } from "./schema/aranceles";
import { sembrarCatalogo } from "./seed-catalogo";

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

  // Los perfiles los crea la migración 0011; aquí solo se asignan.
  const perfilesPorCodigo = new Map(
    (await db.select({ id: perfiles.id, codigo: perfiles.codigo }).from(perfiles)).map((p) => [p.codigo, p.id]),
  );
  const perfilId = (codigo: string) => {
    const id = perfilesPorCodigo.get(codigo);
    if (!id) throw new Error(`Perfil ${codigo} no existe; ejecute las migraciones`);
    return id;
  };

  const [admin] = await db
    .insert(usuarios)
    .values({
      entraOid: "00000000-0000-0000-0000-000000000001",
      email: "admin@legalchile.cl",
      nombre: "Admin Demo",
      perfilId: perfilId("ADMIN"),
    })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(usuarios)
    .values([
      {
        entraOid: "00000000-0000-0000-0000-000000000003",
        email: "jefatura.judicial@legalchile.cl",
        nombre: "Jefatura Judicial Demo",
        perfilId: perfilId("JEFATURA_JUDICIAL"),
      },
      {
        entraOid: "00000000-0000-0000-0000-000000000004",
        email: "contador@legalchile.cl",
        nombre: "Contador Demo",
        perfilId: perfilId("CONTADOR"),
      },
      {
        entraOid: "00000000-0000-0000-0000-000000000005",
        email: "finanzas@legalchile.cl",
        nombre: "Finanzas Demo",
        perfilId: perfilId("GERENCIA_FINANZAS"),
      },
    ])
    .onConflictDoNothing();
  const [jefe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, "jefatura.judicial@legalchile.cl"));

  await db
    .insert(usuarios)
    .values({
      entraOid: "00000000-0000-0000-0000-000000000002",
      email: "abogado@legalchile.cl",
      nombre: "Abogado Demo",
      perfilId: perfilId("ABOGADO"),
      jefeId: jefe?.id ?? null,
      anexo: "201",
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

  // Coberturas referencian planes: el catálogo va después de crearlos.
  await sembrarCatalogo(db);

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
