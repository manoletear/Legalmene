import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

export interface AuthenticatedUser {
  id?: string;
  entraOid: string;
  email: string;
  nombre: string;
  rol: string;
  codPlanes: string[];
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
  return req.user;
});
