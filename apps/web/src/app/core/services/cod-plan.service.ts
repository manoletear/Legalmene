import { Injectable, signal } from "@angular/core";
import { environment } from "../../../environments/environment";

@Injectable({ providedIn: "root" })
export class CodPlanService {
  private readonly _codPlan = signal<string>(
    localStorage.getItem("cod_plan") ?? environment.defaultCodPlan,
  );

  readonly codPlan = this._codPlan.asReadonly();

  set(codPlan: string) {
    localStorage.setItem("cod_plan", codPlan);
    this._codPlan.set(codPlan);
  }
}
