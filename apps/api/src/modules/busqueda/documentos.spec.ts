import { describe, expect, it } from "vitest";
import { consulta, documentoAtencion, rutPlano, MAX_CANDIDATOS } from "./documentos";

describe("búsqueda OpenSearch: documentos y consultas", () => {
  it("normaliza el RUT como la base (solo dígitos y K)", () => {
    expect(rutPlano("12.345.678-k")).toBe("12345678K");
    expect(rutPlano(null)).toBe("");
  });

  it("el documento de atención no incluye datos que no se buscan y lleva el RUT plano", () => {
    const d = documentoAtencion({
      id: "x",
      correlativo: "ASE-2026-000001",
      tipo: "Asesoria",
      estado: "Pendiente",
      asunto: "Divorcio de común acuerdo",
      descripcion: null,
      respuesta: null,
      materia: "Divorcio",
      competencia: "Familia",
      afiliado: "Ana Pérez",
      rut: "12.345.678-5",
      abogado: null,
      gestiones: null,
      fechaApertura: new Date("2026-01-02T12:00:00Z"),
    });
    expect(d).toMatchObject({ rut: "123456785", descripcion: "", abogado: "", fechaApertura: "2026-01-02T12:00:00.000Z" });
    expect(Object.keys(d)).not.toContain("id");
  });

  it("la consulta prioriza correlativo y RUT exactos y tolera errores de tipeo", () => {
    const q = consulta("atenciones", "12.345.678-5") as { size: number; _source: boolean; query: { bool: { should: Record<string, unknown>[] } } };
    expect(q.size).toBe(MAX_CANDIDATOS);
    expect(q._source).toBe(false);
    expect(q.query.bool.should[0]).toEqual({ prefix: { rut: { value: "123456785", boost: 20 } } });
    const texto = q.query.bool.should.find((s) => "multi_match" in s) as { multi_match: { fuzziness: string; operator: string } };
    expect(texto.multi_match).toMatchObject({ fuzziness: "AUTO", operator: "and" });
    // Una palabra no es RUT: no agrega la cláusula de RUT.
    const p = consulta("afiliados", "divorcio") as { query: { bool: { should: Record<string, unknown>[] } } };
    expect(p.query.bool.should.some((s) => "prefix" in s)).toBe(false);
  });
});
