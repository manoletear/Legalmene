import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Rangos que un webhook nunca debe alcanzar: loopback, red privada, link-local (incluye la
// metadata de la nube 169.254.169.254 y el endpoint de credenciales ECS 169.254.170.2), CGNAT,
// multicast/reservados y sus equivalentes IPv6.
export function ipPrivada(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("ff");
}

// Lanza si la URL no es http(s) o si el host resuelve a alguna dirección privada.
// WEBHOOKS_PERMITIR_PRIVADOS=true lo desactiva (solo para pruebas locales).
export async function asegurarDestinoPublico(url: string): Promise<void> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Protocolo no permitido");
  if (process.env.WEBHOOKS_PERMITIR_PRIVADOS === "true") return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (ips.length === 0 || ips.some(ipPrivada)) throw new Error("Destino no permitido (red interna)");
}
