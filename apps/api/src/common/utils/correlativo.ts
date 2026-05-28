import { Database } from "../../db/database.module";
import { correlativos, tipoAtencionEnum } from "../../db/schema/atenciones";
import { sql, and, eq } from "drizzle-orm";

const PREFIJO: Record<string, string> = {
  Consulta: "CONS",
  Asesoria: "ASES",
  Juicio: "JUIC",
};

// Genera correlativo atómico por plan+tipo+año.
// Formato: TIPO-AÑO-NNNNNN (ej: CONS-2026-000123).
export async function siguienteCorrelativo(
  db: Database,
  codPlan: string,
  tipo: "Consulta" | "Asesoria" | "Juicio",
): Promise<string> {
  const anio = String(new Date().getUTCFullYear());

  // UPSERT atómico: incrementa y retorna el nuevo valor en una sola query.
  const result = await db.execute<{ valor: { next: number } }>(sql`
    INSERT INTO ${correlativos} (cod_plan, tipo, anio, valor)
    VALUES (${codPlan}, ${tipo}, ${anio}, '{"next": 2}'::jsonb)
    ON CONFLICT (cod_plan, tipo, anio) DO UPDATE
      SET valor = jsonb_set(${correlativos.valor}, '{next}',
        to_jsonb((${correlativos.valor}->>'next')::int + 1))
    RETURNING valor
  `);

  const fila = result.rows?.[0];
  if (!fila) throw new Error("No se pudo generar correlativo");
  // Cuando es INSERT recién, valor.next quedó en 2 → el "actual" emitido es 1.
  // Cuando es UPDATE, valor.next ya contiene el nuevo valor.
  const next = fila.valor.next;
  const emitido = next === 2 ? 1 : next - 1;
  return `${PREFIJO[tipo]}-${anio}-${String(emitido).padStart(6, "0")}`;
}
