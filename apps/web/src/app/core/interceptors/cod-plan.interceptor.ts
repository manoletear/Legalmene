import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { CodPlanService } from "../services/cod-plan.service";

// Inyecta automáticamente X-Cod-Plan + Authorization en cada request al API.
export const codPlanInterceptor: HttpInterceptorFn = (req, next) => {
  const codPlanService = inject(CodPlanService);
  const codPlan = codPlanService.codPlan();
  const token = localStorage.getItem("entra_token");

  const headers: Record<string, string> = { "X-Cod-Plan": codPlan };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return next(req.clone({ setHeaders: headers }));
};
