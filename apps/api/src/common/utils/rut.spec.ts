import { describe, expect, it } from "vitest";
import { calcularDv, formatearRut, limpiarRut, rutValido } from "./rut";

describe("limpiarRut", () => {
  it("quita puntos, guiones y espacios", () => {
    expect(limpiarRut("12.345.678-9")).toBe("123456789");
    expect(limpiarRut("12 345 678 9")).toBe("123456789");
  });
  it("normaliza K a mayúscula", () => {
    expect(limpiarRut("11.111.111-k")).toBe("11111111K");
  });
});

describe("formatearRut", () => {
  it("añade guion antes del DV", () => {
    expect(formatearRut("123456785")).toBe("12345678-5");
    expect(formatearRut("11111111K")).toBe("11111111-K");
  });
  it("strips leading zeros", () => {
    expect(formatearRut("00012345-6")).toBe("12345-6");
  });
});

describe("calcularDv", () => {
  it("calcula DV numérico estándar", () => {
    expect(calcularDv("12345678")).toBe("5");
    expect(calcularDv("11111111")).toBe("1");
    expect(calcularDv("22222222")).toBe("2");
    expect(calcularDv("23456789")).toBe("6");
  });
});

describe("rutValido", () => {
  it("acepta RUTs con DV correcto", () => {
    expect(rutValido("12345678-5")).toBe(true);
    expect(rutValido("11111111-1")).toBe(true);
    expect(rutValido("22222222-2")).toBe(true);
    expect(rutValido("23456789-6")).toBe(true);
  });
  it("acepta formato con puntos", () => {
    expect(rutValido("12.345.678-5")).toBe(true);
  });
  it("rechaza DV incorrecto", () => {
    expect(rutValido("12345678-9")).toBe(false);
    expect(rutValido("98765432-1")).toBe(false);
  });
  it("rechaza no numérico en cuerpo", () => {
    expect(rutValido("abcdefgh-1")).toBe(false);
  });
  it("rechaza demasiado corto o largo", () => {
    expect(rutValido("1")).toBe(false);
    expect(rutValido("1234567890-0")).toBe(false);
  });
});
