import { Routes } from "@angular/router";

const atencionesList = () =>
  import("./features/atenciones/atenciones-list.component").then(
    (m) => m.AtencionesListComponent,
  );

const stubPage = () =>
  import("./features/stub/stub-page.component").then((m) => m.StubPageComponent);

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
  { path: "atenciones", loadComponent: atencionesList },
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
  { path: "consultas", loadComponent: atencionesList, data: { tipoFiltro: "Consulta" } },
  { path: "asesorias", loadComponent: atencionesList, data: { tipoFiltro: "Asesoria" } },
  { path: "juicios", loadComponent: atencionesList, data: { tipoFiltro: "Juicio" } },
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
  // Stubs — UI futura, sin backend aún.
  {
    path: "aranceles",
    loadComponent: stubPage,
    data: {
      titulo: "Aranceles",
      descripcion: "Catálogo y matriz de aranceles legales",
      icono: "pi-dollar",
    },
  },
  {
    path: "provisiones",
    loadComponent: stubPage,
    data: {
      titulo: "Provisiones",
      descripcion: "Provisiones financieras por caso y cliente",
      icono: "pi-wallet",
    },
  },
  {
    path: "documentos",
    loadComponent: stubPage,
    data: {
      titulo: "Documentos",
      descripcion: "Repositorio centralizado de documentos legales",
      icono: "pi-folder",
    },
  },
  {
    path: "reportes",
    loadComponent: () =>
      import("./features/reportes/reportes.component").then((m) => m.ReportesComponent),
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
