import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { Cron } from "@nestjs/schedule";
import { AuditarProceso, fijarAuditoriaProcesos } from "./auditar-proceso";
import type { AuditService } from "./audit.service";

describe("AuditarProceso", () => {
  it("registra el resultado o el error y conserva el metadato del cron", async () => {
    const logs: { accion: string; entidadId: string; cambios?: { after?: unknown } }[] = [];
    fijarAuditoriaProcesos({ log: async (e: (typeof logs)[number]) => void logs.push(e) } as unknown as AuditService);
    class Tareas {
      @Cron("0 12 * * 1-5")
      @AuditarProceso("prueba.ok")
      async ok() {
        return 3;
      }
      @AuditarProceso("prueba.falla")
      async falla(): Promise<void> {
        throw new TypeError("x");
      }
    }
    const t = new Tareas();
    expect(await t.ok()).toBe(3);
    await expect(t.falla()).rejects.toBeInstanceOf(TypeError);
    expect(logs.map((l) => [l.accion, l.entidadId])).toEqual([
      ["PROCESO", "prueba.ok"],
      ["PROCESO_ERROR", "prueba.falla"],
    ]);
    expect((logs[0].cambios?.after as { resultado: number }).resultado).toBe(3);
    // @nestjs/schedule lee el cron desde la función final.
    expect(Reflect.getMetadataKeys(Tareas.prototype.ok).length).toBeGreaterThan(0);
  });
});
