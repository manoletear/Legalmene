import { createHmac, timingSafeEqual } from "crypto";

// HMAC-SHA256 hex digest del body usando el secret de la suscripción.
// El receptor reproduce esta misma operación y compara con timing-safe.
export function firmarWebhook(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// Comparación timing-safe. Devuelve false si las longitudes difieren para
// evitar leak de longitud por excepción.
export function verificarWebhook(secret: string, body: string, signature: string): boolean {
  const esperado = firmarWebhook(secret, body);
  if (esperado.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(signature, "hex"));
}
