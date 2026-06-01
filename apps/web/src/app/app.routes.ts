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
  {
    path: "gestiones",
    loadComponent: () =>
      import("./features/gestiones/gestiones-global.component").then(
        (m) => m.GestionesGlobalComponent,
      ),
  },
  {
    path: "cargas-masivas",
    loadComponent: () =>
      import("./features/cargas-masivas/cargas-masivas.component").then(
        (m) => m.CargasMasivasComponent,
      ),
  },
  {
    path: "pagos",
    loadComponent: () =>
      import("./features/pagos/pagos.component").then((m) => m.PagosComponent),
  },
  {
    path: "auditoria",
    loadComponent: () =>
      import("./features/auditoria/auditoria.component").then((m) => m.AuditoriaComponent),
  },
  {
    path: "admin/usuarios",
    loadComponent: () =>
      import("./features/admin/admin-usuarios.component").then((m) => m.AdminUsuariosComponent),
  },
  {
    path: "admin/webhooks",
    loadComponent: () =>
      import("./features/admin/admin-webhooks.component").then((m) => m.AdminWebhooksComponent),
  },
  { path: "**", redirectTo: "dashboard" },
];
