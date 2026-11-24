// URL de conexión a Postgres. En local y CI viene como DATABASE_URL; en AWS (ECS) la
// infraestructura entrega las partes por separado: DB_HOST y DB_PORT como variables y
// DB_USERNAME, DB_PASSWORD y DB_NAME desde Secrets Manager (infra/cdk/src/compute-stack.ts).
export function urlBaseDatos(leer: (clave: string) => string | undefined = (k) => process.env[k]): string {
  const url = leer("DATABASE_URL");
  if (url) return url;
  const host = leer("DB_HOST");
  const usuario = leer("DB_USERNAME");
  const clave = leer("DB_PASSWORD");
  const nombre = leer("DB_NAME");
  if (!host || !usuario || !clave || !nombre) {
    throw new Error("DATABASE_URL no configurada (ni DB_HOST, DB_USERNAME, DB_PASSWORD y DB_NAME)");
  }
  const puerto = leer("DB_PORT") || "5432";
  const ssl = leer("DB_SSLMODE");
  return `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}@${host}:${puerto}/${encodeURIComponent(nombre)}${ssl ? `?sslmode=${encodeURIComponent(ssl)}` : ""}`;
}
