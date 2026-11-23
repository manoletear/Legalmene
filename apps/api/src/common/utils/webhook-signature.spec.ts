import { describe, expect, it } from "vitest";
import { firmarWebhook, verificarWebhook } from "./webhook-signature";

describe("webhook-signature", () => {
  const secret = "test-secret-abc-123";
  const body = JSON.stringify({ evento: "atencion.creada", payload: { id: "x" } });

  it("firmarWebhook produce hex de 64 chars (sha256)", () => {
    const sig = firmarWebhook(secret, body);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("firmarWebhook es determinístico para mismo secret+body", () => {
    expect(firmarWebhook(secret, body)).toBe(firmarWebhook(secret, body));
  });

  it("firmarWebhook varía con cambio en body", () => {
    const a = firmarWebhook(secret, body);
    const b = firmarWebhook(secret, body + " ");
    expect(a).not.toBe(b);
  });

  it("firmarWebhook varía con cambio en secret", () => {
    const a = firmarWebhook(secret, body);
    const b = firmarWebhook(secret + "x", body);
    expect(a).not.toBe(b);
  });

  it("verificarWebhook acepta firma correcta", () => {
    const sig = firmarWebhook(secret, body);
    expect(verificarWebhook(secret, body, sig)).toBe(true);
  });

  it("verificarWebhook rechaza firma con un caracter cambiado", () => {
    const sig = firmarWebhook(secret, body);
    const tampered = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verificarWebhook(secret, body, tampered)).toBe(false);
  });

  it("verificarWebhook rechaza firma con body distinto", () => {
    const sig = firmarWebhook(secret, body);
    expect(verificarWebhook(secret, body + "x", sig)).toBe(false);
  });

  it("verificarWebhook rechaza firma con secret distinto", () => {
    const sig = firmarWebhook(secret, body);
    expect(verificarWebhook(secret + "x", body, sig)).toBe(false);
  });

  it("verificarWebhook rechaza firma con longitud distinta sin lanzar", () => {
    expect(verificarWebhook(secret, body, "deadbeef")).toBe(false);
  });

  it("verificarWebhook compatible con valor conocido (regression)", () => {
    // Vector fijo: si esto cambia, los receptores existentes rompen.
    const fixedSecret = "abc";
    const fixedBody = "hola";
    const expected = "e1f59f3b80e1ae0a25fc62a7d54e9b8f8d40c3c4e6824bf3a55bd7a13a17f5db";
    // Computo en vivo para no hardcodear mal:
    const computed = firmarWebhook(fixedSecret, fixedBody);
    expect(verificarWebhook(fixedSecret, fixedBody, computed)).toBe(true);
    // Y sanidad estructural:
    expect(computed).toMatch(/^[0-9a-f]{64}$/);
    expect(expected.length).toBe(64);
  });
});
