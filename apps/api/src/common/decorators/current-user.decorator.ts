import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import type { Permiso } from "@legalmene/shared";

export interface AuthenticatedUser {
  id: string;
  entraOid: string;
  email: string;
  nombre: string;
  perfilId: string;
  perfilCodigo: string;
  perfilNombre: string;
  permisos: Permiso[];
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
  return req.user;
});
