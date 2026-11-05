import { Routes } from "@angular/router";
import { permisoGuard } from "./core/permisos";

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
    path: "afiliados/:id",
    canActivate: [permisoGuard("afiliados.ver")],
    loadComponent: () => import("./features/afiliados/afiliado-detail.component").then((m) => m.AfiliadoDetailComponent),
  },
  {
    path: "afiliados",
    canActivate: [permisoGuard("afiliados.ver")],
    loadComponent: () =>
      import("./features/afiliados/afiliados-list.component").then(
        (m) => m.AfiliadosListComponent,
      ),
  },
  { path: "atenciones", loadComponent: atencionesList },
  {
    path: "atenciones/nueva",
    canActivate: [permisoGuard("atenciones.crear_consulta", "atenciones.crear_caso")],
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
  { path: "posesiones", loadComponent: atencionesList, data: { tipoFiltro: "PosesionEfectiva" } },
  {
    path: "gestiones",
    loadComponent: () =>
      import("./features/gestiones/gestiones-global.component").then(
        (m) => m.GestionesGlobalComponent,
      ),
  },
  {
    path: "cargas-masivas",
    canActivate: [permisoGuard("cargas.ejecutar")],
    loadComponent: () =>
      import("./features/cargas-masivas/cargas-masivas.component").then(
        (m) => m.CargasMasivasComponent,
      ),
  },
  {
    path: "pagos",
    canActivate: [permisoGuard("pagos.ver")],
    loadComponent: () =>
      import("./features/pagos/pagos.component").then((m) => m.PagosComponent),
  },
  {
    path: "auditoria",
    canActivate: [permisoGuard("auditoria.ver")],
    loadComponent: () =>
      import("./features/auditoria/auditoria.component").then((m) => m.AuditoriaComponent),
  },
  {
    path: "aranceles",
    loadComponent: () =>
      import("./features/aranceles/aranceles.component").then((m) => m.ArancelesComponent),
  },
  {
    path: "finanzas",
    canActivate: [permisoGuard("finanzas.ver")],
    loadComponent: () => import("./features/finanzas/finanzas.component").then((m) => m.FinanzasComponent),
  },
  {
    path: "derivaciones",
    canActivate: [permisoGuard("derivaciones.solicitar", "derivaciones.aprobar")],
    loadComponent: () =>
      import("./features/derivaciones/derivaciones.component").then((m) => m.DerivacionesComponent),
  },
  {
    path: "provisiones",
    loadComponent: () =>
      import("./features/provisiones/provisiones.component").then((m) => m.ProvisionesComponent),
  },
  // Stubs — UI futura, sin backend aún.
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
    canActivate: [permisoGuard("reportes.ver")],
    loadComponent: () =>
      import("./features/reportes/reportes.component").then((m) => m.ReportesComponent),
  },
  {
    path: "admin/usuarios",
    canActivate: [permisoGuard("usuarios.administrar")],
    loadComponent: () =>
      import("./features/admin/admin-usuarios.component").then((m) => m.AdminUsuariosComponent),
  },
  {
    path: "admin/perfiles",
    canActivate: [permisoGuard("perfiles.administrar")],
    loadComponent: () =>
      import("./features/admin/admin-perfiles.component").then((m) => m.AdminPerfilesComponent),
  },
  {
    path: "admin/maestros",
    canActivate: [permisoGuard("maestros.administrar")],
    loadComponent: () =>
      import("./features/admin/admin-maestros.component").then((m) => m.AdminMaestrosComponent),
  },
  {
    path: "admin/coberturas",
    loadComponent: () =>
      import("./features/admin/admin-coberturas.component").then((m) => m.AdminCoberturasComponent),
  },
  {
    path: "admin/webhooks",
    canActivate: [permisoGuard("webhooks.ver")],
    loadComponent: () =>
      import("./features/admin/admin-webhooks.component").then((m) => m.AdminWebhooksComponent),
  },
  { path: "**", redirectTo: "dashboard" },
];
