import { describe, expect, it } from "vitest";
import { firmarSesion, tokenBearer, verificarSesion } from "./sesion";
import { baseFrontend, hashToken } from "./enlaces-acceso.service";

const SECRETO = "s".repeat(40);

describe("sesión con enlace de acceso", () => {
  it("firma y verifica el token; rechaza vencido, adulterado u otro secreto", () => {
    const ahora = Date.UTC(2026, 10, 5, 12);
    const { token, expiraEn } = firmarSesion("u-1", 8, SECRETO, ahora);
    expect(expiraEn.getTime()).toBe(ahora + 8 * 3_600_000);
    expect(verificarSesion(token, SECRETO, ahora + 1000)).toBe("u-1");
    expect(verificarSesion(token, SECRETO, ahora + 8 * 3_600_000)).toBeNull();
    expect(verificarSesion(token, "x".repeat(40), ahora)).toBeNull();
    const [h, , f] = token.split(".");
    const otro = Buffer.from(JSON.stringify({ sub: "admin", iss: "legalmene", iat: 0, exp: 9e9 })).toString("base64url");
    expect(verificarSesion(`${h}.${otro}.${f}`, SECRETO, ahora)).toBeNull();
    expect(verificarSesion("no.es.jwt", SECRETO, ahora)).toBeNull();
  });

  it("lee el bearer, hashea tokens y elige el frontend autorizado", () => {
    expect(tokenBearer("Bearer abc.def")).toBe("abc.def");
    expect(tokenBearer("Basic x")).toBeNull();
    expect(hashToken("a")).toHaveLength(64);
    const cfg = "https://a.cl, https://b.cl/";
    expect(baseFrontend("https://b.cl", cfg)).toBe("https://b.cl");
    expect(baseFrontend("https://malo.cl", cfg)).toBe("https://a.cl");
    expect(baseFrontend(null, cfg)).toBe("https://a.cl");
  });
});
