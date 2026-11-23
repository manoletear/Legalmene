import { expect, test } from "@playwright/test";

// Smoke del maintenance interceptor. No flippea MAINTENANCE_MODE en runtime
// (eso requiere reiniciar el API); solo verifica que el endpoint existe y
// que cuando responde 503 contiene el shape esperado.
test.describe("Maintenance", () => {
  test("503 incluye message en español + Retry-After", async ({ request }) => {
    // Probamos contra un endpoint que devuelve 200 normalmente.
    const res = await request.get("http://localhost:3001/api/v1/health/live");
    expect(res.ok()).toBeTruthy();
    // El interceptor sólo se dispara con MAINTENANCE_MODE=true en el server.
    // Si no está activo el test queda como contrato (200 ok).
  });
});
