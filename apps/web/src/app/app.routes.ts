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
  {
    path: "atenciones/nueva",
    loadComponent: () =>
      import("./features/atenciones/atencion-form.component").then((m) => m.AtencionFormComponent),
  },
  {
    path: "atenciones/:id",
    loadComponent: () =>
      import("./features/atenciones/atencion-detail.component").then(
        (m) => m.AtencionDetailComponent,
      ),
  },
  { path: "**", redirectTo: "dashboard" },
];
