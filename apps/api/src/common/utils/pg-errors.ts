// Drizzle envuelve el error de pg en `cause` según el driver/versión.
export function codigoPg(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export function esViolacionUnica(err: unknown): boolean {
  return codigoPg(err) === "23505";
}
