import { createParamDecorator, ExecutionContext, BadRequestException } from "@nestjs/common";
import { Request } from "express";

// Plan obligatorio como query param (?codPlan=) para recursos que pertenecen a un
// plan concreto, como las suscripciones de webhooks. No es un filtro de tenant.
export const PlanRequerido = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const valor = req.query["codPlan"];
  const codPlan = Array.isArray(valor) ? valor[0] : valor;
  if (typeof codPlan !== "string" || codPlan.trim() === "") {
    throw new BadRequestException("Query param 'codPlan' es obligatorio");
  }
  return codPlan.trim();
});
