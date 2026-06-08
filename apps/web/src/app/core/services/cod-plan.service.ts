import { Injectable, signal } from "@angular/core";
import { environment } from "../../../environments/environment";

@Injectable({ providedIn: "root" })
export class CodPlanService {
  private readonly _codPlan = signal<string>(
    localStorage.getItem("cod_plan") ?? environment.defaultCodPlan,
  );

  readonly codPlan = this._codPlan.asReadonly();

  set(codPlan: string) {
    if (codPlan === this._codPlan()) return;
    localStorage.setItem("cod_plan", codPlan);
    this._codPlan.set(codPlan);
    // Hard reload para que todas las pantallas re-fetch sus datos con el nuevo tenant.
    if (typeof window !== "undefined") window.location.reload();
  }
}
