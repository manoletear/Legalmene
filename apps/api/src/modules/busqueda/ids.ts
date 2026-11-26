import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// Candidatos de OpenSearch como filtro de la base: sin candidatos, ninguna fila.
export function condicionIds(col: AnyPgColumn, ids: string[]): SQL {
  return ids.length ? sql`${col} = any(${sql.raw("ARRAY[")}${sql.join(ids.map((i) => sql`${i}`), sql`, `)}${sql.raw("]::uuid[]")})` : sql`false`;
}

// Orden de relevancia de OpenSearch (posición en la lista de candidatos).
export function ordenIds(col: AnyPgColumn, ids: string[]): SQL {
  return sql`array_position(${sql.raw("ARRAY[")}${sql.join(ids.map((i) => sql`${i}`), sql`, `)}${sql.raw("]::uuid[]")}, ${col})`;
}
