import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  MODULOS_PERMISOS,
  PERFILES_SISTEMA,
  PERFIL_ADMIN,
  PERFIL_POR_DEFECTO,
  PERMISOS,
  alcanceAtenciones,
  permisosDePerfil,
} from "@legalmene/shared";
import { PermisosGuard } from "../guards/permisos.guard";
import { PERMISO_KEY } from "../decorators/permiso.decorator";
import { dominioPermitido } from "../../modules/auth/jwt-auth.guard";
import { accesoActual, ejecutarComo } from "./contexto";
import { claveAlcance, filtroAtenciones } from "./alcance";

describe("catálogo de permisos y perfiles", () => {
  it("las claves son únicas y cada perfil del sistema usa solo claves del catálogo", () => {
    expect(new Set(PERMISOS).size).toBe(PERMISOS.length);
    const todas = MODULOS_PERMISOS.flatMap((m) => Object.keys(m.permisos));
    expect(todas).toEqual(PERMISOS);
    const validas = new Set<string>(PERMISOS);
    for (const p of PERFILES_SISTEMA) for (const k of p.permisos) expect(validas.has(k), `${p.codigo}: ${k}`).toBe(true);
    expect(new Set(PERFILES_SISTEMA.map((p) => p.codigo)).size).toBe(PERFILES_SISTEMA.length);
    expect(PERFILES_SISTEMA.some((p) => p.codigo === PERFIL_POR_DEFECTO)).toBe(true);
  });

  it("ADMIN recibe siempre todos los permisos, aunque no tenga filas asignadas", () => {
    expect(permisosDePerfil(PERFIL_ADMIN, [])).toEqual(PERMISOS);
  });

  it("descarta claves desconocidas (p. ej. permisos retirados del catálogo)", () => {
    expect(permisosDePerfil("ABOGADO", ["gestiones.registrar", "clave.retirada"])).toEqual(["gestiones.registrar"]);
  });

  it("el alcance de atenciones sale de ver_todas / ver_equipo", () => {
    expect(alcanceAtenciones(["atenciones.ver_todas", "atenciones.ver_equipo"])).toBe("todas");
    expect(alcanceAtenciones(["atenciones.ver_equipo"])).toBe("equipo");
    expect(alcanceAtenciones(["gestiones.registrar"])).toBe("propias");
    const abogado = PERFILES_SISTEMA.find((p) => p.codigo === "ABOGADO")!;
    const jefatura = PERFILES_SISTEMA.find((p) => p.codigo === "JEFATURA_JUDICIAL")!;
    expect(alcanceAtenciones(abogado.permisos)).toBe("propias");
    expect(alcanceAtenciones(jefatura.permisos)).toBe("equipo");
  });
});

describe("contexto de acceso", () => {
  it("sin usuario (scheduler, seed) no restringe; con usuario acota y separa la caché", () => {
    expect(accesoActual()).toBeUndefined();
    expect(filtroAtenciones()).toBeUndefined();
    expect(claveAlcance()).toBe("todas");
    ejecutarComo({ usuarioId: "u-1", permisos: new Set(["gestiones.registrar"]) }, () => {
      expect(filtroAtenciones()).toBeDefined();
      expect(claveAlcance()).toBe("u:u-1");
    });
    ejecutarComo({ usuarioId: "u-2", permisos: new Set(["atenciones.ver_todas"]) }, () => {
      expect(filtroAtenciones()).toBeUndefined();
      expect(claveAlcance()).toBe("todas");
    });
  });
});

describe("PermisosGuard", () => {
  const guardCon = (requerido: string | undefined, permisos: string[]) => {
    const reflector = { getAllAndOverride: (k: string) => (k === PERMISO_KEY ? requerido : undefined) } as unknown as Reflector;
    const ctx = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user: { permisos } }) }),
    } as never;
    return () => new PermisosGuard(reflector).canActivate(ctx);
  };

  it("deja pasar rutas sin permiso y a quien tiene la clave", () => {
    expect(guardCon(undefined, [])()).toBe(true);
    expect(guardCon("afiliados.crear", ["afiliados.crear"])()).toBe(true);
  });

  it("responde 403 con el nombre del permiso en español", () => {
    expect(guardCon("afiliados.eliminar", ["afiliados.crear"])).toThrow(ForbiddenException);
    expect(guardCon("afiliados.eliminar", ["afiliados.crear"])).toThrow(/Eliminar afiliados/);
  });
});

describe("dominio de correo permitido", () => {
  it("acepta solo los dominios configurados", () => {
    expect(dominioPermitido("ana@legalchile.cl", undefined)).toBe(true);
    expect(dominioPermitido("ana@LEGALCHILE.CL", undefined)).toBe(true);
    expect(dominioPermitido("ana@gmail.com", undefined)).toBe(false);
    expect(dominioPermitido("ana@socio.cl", "legalchile.cl, socio.cl")).toBe(true);
  });
});
