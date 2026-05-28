import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", redirectTo: "dashboard", pathMatch: "full" },
  {
    path: "dashboard",
    loadComponent: () =>
      import("./features/dashboard/dashboard.component").then((m) => m.DashboardComponent),
  },
  {
    path: "afiliados",
    loadComponent: () =>
      import("./features/afiliados/afiliados-list.component").then(
        (m) => m.AfiliadosListComponent,
      ),
  },
  {
    path: "atenciones",
    loadComponent: () =>
      import("./features/atenciones/atenciones-list.component").then(
        (m) => m.AtencionesListComponent,
      ),
  },
  { path: "**", redirectTo: "dashboard" },
];
