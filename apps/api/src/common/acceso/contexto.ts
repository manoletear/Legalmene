import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import type { Permiso } from "@legalmene/shared";

// Usuario que ejecuta la operación actual. Lo fija JwtAuthGuard en cada request; los
// servicios lo leen para acotar las atenciones visibles sin pasarlo por parámetro.
export interface Acceso {
  usuarioId: string;
  permisos: ReadonlySet<Permiso>;
}

interface Contexto {
  acceso?: Acceso;
}

const als = new AsyncLocalStorage<Contexto>();

// Middleware: cada request corre dentro de su propio contexto.
export function contextoMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  als.run({}, () => next());
}

export function fijarAcceso(acceso: Acceso): void {
  const store = als.getStore();
  if (store) store.acceso = acceso;
}

// Sin contexto (scheduler, seed, tests de servicio) = proceso del sistema, sin restricción.
export function accesoActual(): Acceso | undefined {
  return als.getStore()?.acceso;
}

// Ejecuta fn como el usuario indicado (tests y llamadas internas que deben respetar el alcance).
export function ejecutarComo<T>(acceso: Acceso, fn: () => T): T {
  return als.run({ acceso }, fn);
}
