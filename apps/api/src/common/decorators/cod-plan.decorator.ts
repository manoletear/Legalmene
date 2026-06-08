import { createParamDecorator, ExecutionContext, BadRequestException } from "@nestjs/common";
import { Request } from "express";

// Extrae el CodPlan del usuario autenticado (tenant_id).
// El JWT validado por Entra ID debe incluir "extension_CodPlanes" o claim equivalente.
export const CodPlan = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: { codPlanes?: string[] } }>();
  const planHeader = req.headers["x-cod-plan"];
  const requested = Array.isArray(planHeader) ? planHeader[0] : planHeader;
  const userPlanes = req.user?.codPlanes ?? [];

  if (!requested) throw new BadRequestException("Header X-Cod-Plan requerido");
  if (userPlanes.length > 0 && !userPlanes.includes(requested)) {
    throw new BadRequestException(`Usuario no tiene acceso al plan ${requested}`);
  }
  return requested;
});
