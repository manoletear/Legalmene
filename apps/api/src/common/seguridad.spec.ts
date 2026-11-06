import { describe, expect, it } from "vitest";
import { redactar, rutaSinAuditoria } from "../modules/audit/audit.interceptor";
import { ipPrivada, asegurarDestinoPublico } from "./utils/destino-publico";
import { escaparHtml, textoLinea } from "./utils/html";
import { claveCorrespondeAAtencion } from "../modules/documentos/documentos.service";
import { contentDisposition } from "../modules/documentos/local.storage";
import { entraConfigurado } from "../modules/auth/jwt-auth.guard";
import { CrearWebhookSchema } from "@legalmene/shared";

// Regresiones unitarias de la auditoría de seguridad (run-1).
describe("auditoría", () => {
  it("nunca guarda credenciales y no se evade con la query string", () => {
    const r = redactar({ token: "t", expiraEn: "x", nested: [{ secret: "s", Authorization: "a", ok: 1 }], headers: { X: "y" } });
    expect(r).toEqual({ token: "[REDACTADO]", expiraEn: "x", nested: [{ secret: "[REDACTADO]", Authorization: "[REDACTADO]", ok: 1 }], headers: "[REDACTADO]" });
    expect(rutaSinAuditoria("/api/v1/auth/enlace/verificar")).toBe(true);
    expect(rutaSinAuditoria("/api/v1/health/live")).toBe(true);
    expect(rutaSinAuditoria("/api/v1/webhooks/123")).toBe(false);
    expect(rutaSinAuditoria("/api/v1/pagos/confirmar")).toBe(false);
    expect(rutaSinAuditoria("/api/v1/healthcheck-falso")).toBe(false);
  });
});

describe("webhooks", () => {
  it("rechaza destinos internos y cabeceras reservadas", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "169.254.170.2", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(ipPrivada(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "200.1.2.3", "2001:4860:4860::8888"]) expect(ipPrivada(ip), ip).toBe(false);
    await expect(asegurarDestinoPublico("http://127.0.0.1:9001/x")).rejects.toThrow();
    await expect(asegurarDestinoPublico("http://[::1]/x")).rejects.toThrow();
    await expect(asegurarDestinoPublico("file:///etc/passwd")).rejects.toThrow();
    const base = { nombre: "R", url: "https://r.test/h", eventos: ["atencion.creada"] };
    expect(CrearWebhookSchema.safeParse(base).success).toBe(true);
    expect(CrearWebhookSchema.safeParse({ ...base, url: "ftp://r.test" }).success).toBe(false);
    expect(CrearWebhookSchema.safeParse({ ...base, eventos: ["otro"] }).success).toBe(false);
    expect(CrearWebhookSchema.safeParse({ ...base, headers: { "X-Legalmene-Signature": "x" } }).success).toBe(false);
  });
});

describe("documentos", () => {
  it("la clave debe ser la emitida para la atención y el nombre de descarga es seguro", () => {
    const k = (seg: string) => `atenciones/2026/${seg}/01JC0000000000000000000000-a.pdf`;
    expect(claveCorrespondeAAtencion(k("abc"), "abc")).toBe(true);
    expect(claveCorrespondeAAtencion(k("abc"), "otra")).toBe(false);
    expect(claveCorrespondeAAtencion(k("abc"), null)).toBe(false);
    expect(claveCorrespondeAAtencion(k("sin-atencion"), undefined)).toBe(true);
    expect(claveCorrespondeAAtencion("otra/ruta.pdf", undefined)).toBe(false);
    const cd = contentDisposition('a"; filename=evil.html; x=".pdf');
    expect(cd.startsWith('attachment; filename="a__ filename_evil.html_ x__.pdf"')).toBe(true);
    expect(cd).toContain("filename*=UTF-8''");
  });
});

describe("correo y configuración", () => {
  it("escapa HTML, deja el asunto en una línea y exige Entra fijado", () => {
    expect(escaparHtml('<a href="x">&\'')).toBe("&#60;a href=&#34;x&#34;&#62;&#38;&#39;");
    expect(textoLinea("Hola\r\nBcc: x@y\tz")).toBe("Hola Bcc: x@y z");
    expect(entraConfigurado({})).toBe(false);
    expect(entraConfigurado({ ENTRA_AUDIENCE: "api://x" })).toBe(false);
    expect(entraConfigurado({ ENTRA_AUDIENCE: "api://x", ENTRA_ISSUER: "https://login.microsoftonline.com/t/v2.0" })).toBe(true);
  });
});
