import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Logger } from "@nestjs/common";

// Token de sesión propio (JWT HS256) para quienes ingresan con enlace de acceso.
// Convive con los tokens de Entra ID (RS256): el guard prueba primero este formato.
export const EMISOR_SESION = "legalmene";

export interface ClaimsSesion {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  ver?: number;
}

let secretoGenerado: string | null = null;

// SESSION_JWT_SECRET firma las sesiones. Sin él (desarrollo) se usa uno aleatorio por proceso:
// las sesiones se pierden al reiniciar, lo que es aceptable fuera de producción.
export function secretoSesion(): string {
  const configurado = process.env.SESSION_JWT_SECRET;
  if (configurado && configurado.length >= 32) return configurado;
  if (process.env.NODE_ENV === "production" && process.env.AUTH_DISABLED !== "true") {
    throw new Error("SESSION_JWT_SECRET debe tener al menos 32 caracteres en producción");
  }
  if (!secretoGenerado) {
    secretoGenerado = randomBytes(32).toString("hex");
    new Logger("Sesion").warn("SESSION_JWT_SECRET no definido: se usa un secreto temporal (las sesiones no sobreviven reinicios)");
  }
  return secretoGenerado;
}

const b64 = (v: Buffer | string) => Buffer.from(v).toString("base64url");
const CABECERA = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));

function firma(datos: string, secreto: string): Buffer {
  return createHmac("sha256", secreto).update(datos).digest();
}

export function firmarSesion(
  usuarioId: string,
  horas: number,
  secreto = secretoSesion(),
  ahora = Date.now(),
  version = 0,
) {
  const iat = Math.floor(ahora / 1000);
  const claims: ClaimsSesion = { sub: usuarioId, iss: EMISOR_SESION, iat, exp: iat + horas * 3600, ver: version };
  const cuerpo = `${CABECERA}.${b64(JSON.stringify(claims))}`;
  return { token: `${cuerpo}.${b64(firma(cuerpo, secreto))}`, expiraEn: new Date(claims.exp * 1000) };
}

export interface SesionValida {
  usuarioId: string;
  // Versión de sesión del usuario al emitir el token; el guard la compara con la actual.
  version: number;
}

// Devuelve el usuario y la versión si el token es una sesión válida y vigente; null en cualquier otro caso.
export function verificarSesion(token: string, secreto = secretoSesion(), ahora = Date.now()): SesionValida | null {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== CABECERA) return null;
  const esperada = firma(`${partes[0]}.${partes[1]}`, secreto);
  const recibida = Buffer.from(partes[2], "base64url");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const c = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as Partial<ClaimsSesion>;
    if (c.iss !== EMISOR_SESION || typeof c.sub !== "string" || typeof c.exp !== "number") return null;
    if (c.exp * 1000 <= ahora) return null;
    return { usuarioId: c.sub, version: typeof c.ver === "number" ? c.ver : 0 };
  } catch {
    return null;
  }
}

export function tokenBearer(authorization: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  return m ? m[1] : null;
}
