import type { AuditService } from "./audit.service";

// Registro de procesos programados en la auditoría (Anexo §I l.63: log de procesos y errores).
// La instancia la fija AuditService al construirse; sin ella (pruebas) el proceso corre igual.
let servicio: AuditService | null = null;
export function fijarAuditoriaProcesos(s: AuditService) {
  servicio = s;
}

// Va DEBAJO de @Cron, para que el metadato del cron quede en la función envuelta.
export function AuditarProceso(nombre: string): MethodDecorator {
  return (_target, _key, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;
    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const inicio = Date.now();
      try {
        const r = await original.apply(this, args);
        await servicio?.log({
          accion: "PROCESO",
          entidad: "procesos",
          entidadId: nombre,
          cambios: { after: { resultado: typeof r === "number" || (r && typeof r === "object") ? r : null, ms: Date.now() - inicio } },
        });
        return r;
      } catch (e) {
        await servicio?.log({
          accion: "PROCESO_ERROR",
          entidad: "procesos",
          entidadId: nombre,
          cambios: { after: { error: e instanceof Error ? e.name : "Error", ms: Date.now() - inicio } },
        });
        throw e;
      }
    };
    return descriptor;
  };
}
