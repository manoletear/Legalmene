import { Component, OnInit, ViewChild, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet, Router } from "@angular/router";
import { filter } from "rxjs";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { ButtonModule } from "primeng/button";
import { DrawerModule } from "primeng/drawer";
import { PopoverModule } from "primeng/popover";
import { OverlayBadgeModule } from "primeng/overlaybadge";
import { TooltipModule } from "primeng/tooltip";
import { Popover } from "primeng/popover";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { ToastModule } from "primeng/toast";
import type { Permiso } from "@legalmene/shared";
import { MeService } from "./core/services/me.service";
import { SesionService } from "./core/services/sesion.service";
import { MaintenanceService } from "./core/services/maintenance.service";
import { NotifInboxApiService, NotifItem } from "./core/services/notif-inbox.service";

interface NavItem {
  label: string;
  icon: string;
  route: string;
  // Basta uno de estos permisos para ver la opción.
  permisos?: Permiso[];
}

interface NavGrupo {
  titulo: string;
  items: NavItem[];
}

const CLAVE_MENU_EXPANDIDO = "lm.menuExpandido";

@Component({
  selector: "lm-root",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    DrawerModule,
    PopoverModule,
    OverlayBadgeModule,
    TooltipModule,
    ConfirmDialogModule,
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <ng-template #soloLogin><router-outlet /></ng-template>

    <div class="lm-shell" *ngIf="!enLogin(); else soloLogin">
      <aside class="lm-sidebar" [class.colapsado]="!menuExpandido()" *ngIf="!isMobile()">
        <div class="lm-sidebar-top">
          <ng-container *ngIf="menuExpandido(); else soloHamburguesa">
            <div class="lm-brand lm-brand-claro">
              <div class="lm-brand-mark">LC</div>
              <div class="lm-brand-text">
                <strong>LEGAL CHILE</strong>
                <small>tu abogado siempre</small>
              </div>
            </div>
            <button type="button" class="lm-sidebar-toggle" (click)="alternarMenu()" aria-label="Colapsar menú" aria-expanded="true">
              <i class="pi pi-arrow-left"></i>
            </button>
          </ng-container>
          <ng-template #soloHamburguesa>
            <button
              type="button"
              class="lm-sidebar-toggle"
              (click)="alternarMenu()"
              aria-label="Expandir menú"
              aria-expanded="false"
              pTooltip="Expandir menú"
              tooltipPosition="right"
            >
              <i class="pi pi-bars"></i>
            </button>
          </ng-template>
        </div>
        <ng-container *ngTemplateOutlet="navegacion; context: { compacto: !menuExpandido() }"></ng-container>
      </aside>

      <div class="lm-main-col">
    <!-- Header band con brand + search + user -->
    <header class="lm-top-header">
      <button
        *ngIf="isMobile()"
        pButton
        type="button"
        icon="pi pi-bars"
        [text]="true"
        severity="secondary"
        (click)="mobileDrawerVisible = true"
        aria-label="Abrir menú"
      ></button>

      <div class="lm-brand" *ngIf="isMobile() || !menuExpandido()">
        <div class="lm-brand-mark">LC</div>
        <div class="lm-brand-text">
          <strong>LEGAL CHILE</strong>
          <small>tu abogado siempre</small>
        </div>
      </div>

      <span class="lm-platform-title" *ngIf="!isMobile()">
        Plataforma Integral de Gestión Legal y Operación de Servicios
      </span>

      <div class="lm-search" *ngIf="!isMobile()">
        <i class="pi pi-search"></i>
        <input
          type="text"
          [(ngModel)]="searchTerm"
          (keyup.enter)="ejecutarBusqueda()"
          placeholder="Buscar casos, clientes, documentos..."
        />
        <span class="lm-kbd">⌘K</span>
      </div>

      <span style="flex:1"></span>

      <!-- Bell + notif popover -->
      <p-overlayBadge [value]="unseenCount() || ''" severity="danger" [hidden]="unseenCount() === 0">
        <button
          pButton
          type="button"
          icon="pi pi-bell"
          [text]="true"
          severity="secondary"
          pTooltip="Notificaciones"
          (click)="abrirNotifPopover($event)"
        ></button>
      </p-overlayBadge>
      <p-popover #notifPopover (onShow)="cargarInbox()">
        <div style="min-width:340px;">
          <div style="display:flex; align-items:center; gap:8px; padding:0 0 8px 0; border-bottom:1px solid #eee;">
            <strong style="flex:1;">Notificaciones</strong>
            <button
              pButton type="button" label="Marcar todas leídas" [text]="true" size="small"
              *ngIf="unseenCount() > 0"
              (click)="marcarTodasLeidas()"
            ></button>
          </div>
          <div style="padding:16px 0;" *ngIf="!inboxItems().length">
            <em class="lm-muted">Sin notificaciones</em>
          </div>
          <div
            *ngFor="let n of inboxItems()"
            (click)="abrirNotif(n)"
            style="display:flex; flex-direction:column; padding:8px 12px; cursor:pointer; border-bottom:1px solid #f1f5f9;"
            [style.borderLeft]="
              n.severidad === 'critical' ? '4px solid #dc2626'
              : n.severidad === 'warn' ? '4px solid #ea580c'
              : '4px solid #2563eb'
            "
            [style.background]="n.seen ? 'transparent' : 'rgba(37,99,235,0.04)'"
          >
            <strong [style.fontWeight]="n.seen ? 'normal' : '600'">{{ n.titulo }}</strong>
            <small *ngIf="n.detalle" class="lm-muted">{{ n.detalle }}</small>
            <small style="opacity:0.5;">{{ n.createdAt | date: 'short' }}</small>
          </div>
        </div>
      </p-popover>

      <!-- User chip -->
      <ng-container *ngIf="me.user() as user; else loggingIn">
        <div class="lm-user-chip" (click)="abrirUserPopover($event)">
          <div class="lm-user-meta" *ngIf="!isMobile()">
            <strong>{{ user.nombre }}</strong>
            <small>{{ user.perfil.nombre }}</small>
          </div>
          <div class="lm-avatar">{{ avatarIniciales(user.nombre) }}</div>
        </div>
        <p-popover #userPopover>
          <div style="min-width:240px;">
            <div style="padding:6px 4px; border-bottom:1px solid #eee; font-size:13px; color:#475569;">
              {{ user.email }}
            </div>
            <div class="lm-small" style="padding:8px 4px;">
              Perfil: <strong style="color:#2563eb;">{{ user.perfil.nombre }}</strong>
            </div>
            <button
              pButton type="button" icon="pi pi-sign-out" label="Cerrar sesión" [text]="true" size="small"
              *ngIf="sesionActiva()" (click)="cerrarSesion()"
            ></button>
          </div>
        </p-popover>
      </ng-container>
      <ng-template #loggingIn>
        <span class="lm-muted">{{ me.error() ? "Sin sesión" : "Cargando…" }}</span>
      </ng-template>
    </header>

    <!-- Maintenance banner -->
    <div
      *ngIf="maint.active()"
      style="background:#fff4e0; border-bottom:1px solid #f9b04c; padding:8px 16px; display:flex; align-items:center; gap:8px;"
    >
      <i class="pi pi-exclamation-triangle" style="color:#c66400;"></i>
      <span>Sistema en mantenimiento: las acciones de escritura están temporalmente deshabilitadas.</span>
    </div>

      <ng-template #navegacion let-compacto="compacto">
        <nav>
          <div class="lm-nav-grupo" *ngFor="let grupo of gruposVisibles(); let primero = first">
            <button
              type="button"
              class="lm-nav-titulo"
              *ngIf="!compacto && grupo.titulo"
              (click)="alternarGrupo(grupo.titulo, $event)"
              [attr.aria-expanded]="grupoAbierto(grupo.titulo)"
            >
              <span>{{ grupo.titulo }}</span>
              <i class="pi {{ grupoAbierto(grupo.titulo) ? 'pi-minus' : 'pi-plus' }}" aria-hidden="true"></i>
            </button>
            <hr class="lm-nav-separador" *ngIf="compacto && !primero" />
            <ng-container *ngIf="compacto || !grupo.titulo || grupoAbierto(grupo.titulo)">
            <a
              *ngFor="let item of grupo.items"
              [routerLink]="item.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              [pTooltip]="compacto ? item.label : ''"
              tooltipPosition="right"
              [attr.aria-label]="item.label"
            >
              <i class="pi {{ item.icon }}"></i>
              <span *ngIf="!compacto">{{ item.label }}</span>
            </a>
            </ng-container>
          </div>
        </nav>
      </ng-template>

      <p-drawer
        [(visible)]="mobileDrawerVisible"
        position="left"
        [style]="{ width: '260px' }"
        styleClass="lm-drawer-oscuro"
        *ngIf="isMobile()"
      >
        <div class="lm-sidebar lm-sidebar-drawer" (click)="mobileDrawerVisible = false">
          <ng-container *ngTemplateOutlet="navegacion; context: { compacto: false }"></ng-container>
        </div>
      </p-drawer>

      <main class="lm-main">
        <div class="page">
          <div *ngIf="me.error() as err; else contenido" class="lm-error-sesion" role="alert">
            <i class="pi {{ err.tipo === 'sin_conexion' ? 'pi-wifi' : 'pi-lock' }}"></i>
            <h2>{{ err.tipo === "sin_conexion" ? "No se pudo conectar con el servidor" : err.tipo === "sin_sesion" ? "Sesión no iniciada" : "Acceso no habilitado" }}</h2>
            <p>{{ err.mensaje }}</p>
            <a pButton *ngIf="err.tipo === 'sin_sesion'; else botonReintentar" routerLink="/login" icon="pi pi-sign-in" label="Ingresar"></a>
            <ng-template #botonReintentar>
              <button pButton type="button" icon="pi pi-refresh" label="Reintentar" (click)="reintentar()"></button>
            </ng-template>
          </div>
          <ng-template #contenido><router-outlet /></ng-template>
        </div>
      </main>
      </div>
    </div>
  `,
})
export class AppComponent implements OnInit {
  protected me = inject(MeService);
  protected maint = inject(MaintenanceService);
  private notif = inject(NotifInboxApiService);
  private router = inject(Router);
  private breakpoints = inject(BreakpointObserver);
  private sesion = inject(SesionService);

  // La pantalla de login se muestra sin el menú ni el header.
  protected enLogin = signal(esRutaLogin(location.pathname));
  protected sesionActiva = signal(this.sesion.activa);

  @ViewChild("notifPopover") private notifPopover!: Popover;
  @ViewChild("userPopover") private userPopover!: Popover;

  protected unseenCount = signal(0);
  protected inboxItems = signal<NotifItem[]>([]);
  protected isMobile = signal(false);
  protected mobileDrawerVisible = false;
  protected searchTerm = "";

  protected menuExpandido = signal(leerMenuExpandido());

  private readonly grupos: NavGrupo[] = [
    { titulo: "", items: [{ label: "Dashboard", icon: "pi-home", route: "/dashboard" }] },
    {
      titulo: "Atenciones",
      items: [
        { label: "Consultas", icon: "pi-comment", route: "/consultas" },
        { label: "Asesorías", icon: "pi-id-card", route: "/asesorias" },
        { label: "Juicios", icon: "pi-briefcase", route: "/juicios" },
        { label: "Posesiones efectivas", icon: "pi-book", route: "/posesiones" },
        { label: "Derivaciones", icon: "pi-share-alt", route: "/derivaciones", permisos: ["derivaciones.solicitar", "derivaciones.aprobar"] },
        { label: "Gestiones", icon: "pi-check-square", route: "/gestiones" },
        { label: "Documentos", icon: "pi-folder", route: "/documentos" },
      ],
    },
    {
      titulo: "Afiliados",
      items: [
        { label: "Afiliados", icon: "pi-users", route: "/afiliados", permisos: ["afiliados.ver"] },
        { label: "Cargas masivas", icon: "pi-cloud-upload", route: "/cargas-masivas", permisos: ["cargas.ejecutar"] },
      ],
    },
    {
      titulo: "Finanzas",
      items: [
        { label: "Aranceles", icon: "pi-dollar", route: "/aranceles" },
        { label: "Coberturas", icon: "pi-percentage", route: "/admin/coberturas" },
        { label: "Provisiones", icon: "pi-wallet", route: "/provisiones" },
        { label: "Pagos", icon: "pi-credit-card", route: "/pagos", permisos: ["pagos.ver"] },
        { label: "Bandeja de finanzas", icon: "pi-money-bill", route: "/finanzas", permisos: ["finanzas.ver"] },
      ],
    },
    {
      titulo: "Control",
      items: [
        { label: "Reportes", icon: "pi-chart-bar", route: "/reportes", permisos: ["reportes.ver"] },
        { label: "Auditoría", icon: "pi-history", route: "/auditoria", permisos: ["auditoria.ver"] },
      ],
    },
    {
      titulo: "Administración",
      items: [
        { label: "Usuarios", icon: "pi-shield", route: "/admin/usuarios", permisos: ["usuarios.administrar"] },
        { label: "Perfiles", icon: "pi-key", route: "/admin/perfiles", permisos: ["perfiles.administrar"] },
        { label: "Maestros", icon: "pi-list", route: "/admin/maestros", permisos: ["maestros.administrar"] },
        { label: "Webhooks", icon: "pi-link", route: "/admin/webhooks", permisos: ["webhooks.ver"] },
      ],
    },
  ];

  // Solo las opciones que el perfil puede ver; un grupo sin opciones no se muestra.
  protected gruposVisibles = computed<NavGrupo[]>(() => {
    this.me.permisos();
    return this.grupos
      .map((g) => ({ ...g, items: g.items.filter((i) => !i.permisos || this.me.algunoDe(i.permisos)) }))
      .filter((g) => g.items.length > 0);
  });

  // Con el menú expandido los grupos parten cerrados; el usuario los abre con + y cierra con −.
  private gruposAbiertos = signal<ReadonlySet<string>>(new Set());

  protected grupoAbierto(titulo: string): boolean {
    return this.gruposAbiertos().has(titulo);
  }

  protected alternarGrupo(titulo: string, ev: Event) {
    // En el drawer móvil un clic en el título no debe cerrar el menú.
    ev.stopPropagation();
    const abiertos = new Set(this.gruposAbiertos());
    if (abiertos.has(titulo)) abiertos.delete(titulo);
    else abiertos.add(titulo);
    this.gruposAbiertos.set(abiertos);
  }

  protected alternarMenu() {
    const valor = !this.menuExpandido();
    this.menuExpandido.set(valor);
    try {
      localStorage.setItem(CLAVE_MENU_EXPANDIDO, valor ? "1" : "0");
    } catch {
      // Sin almacenamiento local el menú vuelve a su estado por defecto al recargar.
    }
  }

  protected reintentar() {
    window.location.reload();
  }

  protected cerrarSesion() {
    this.userPopover?.hide();
    this.sesion.cerrarEnServidor().subscribe(() => {
      this.sesionActiva.set(false);
      this.me.reiniciar();
      void this.router.navigate(["/login"]);
    });
  }

  ngOnInit() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.enLogin.set(esRutaLogin(e.urlAfterRedirects));
      this.sesionActiva.set(this.sesion.activa);
    });
    if (!this.enLogin()) this.me.load();
    this.cargarInbox();
    this.breakpoints
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .subscribe((r) => this.isMobile.set(r.matches));
    setInterval(() => this.cargarInbox(), 60_000);
  }

  abrirNotifPopover(ev: Event) { this.notifPopover.toggle(ev); }
  abrirUserPopover(ev: Event) { this.userPopover.toggle(ev); }

  ejecutarBusqueda() {
    const q = this.searchTerm.trim();
    if (!q) return;
    // Un RUT va a la búsqueda de afiliados; el resto, a la búsqueda de atenciones (búsqueda explícita).
    if (/^[0-9.\s]{6,}-?[0-9kK]$/.test(q)) void this.router.navigate(["/afiliados"], { queryParams: { rut: q } });
    else void this.router.navigate(["/atenciones"], { queryParams: { q } });
  }

  avatarIniciales(nombre: string): string {
    const parts = nombre.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
  }

  cargarInbox() {
    if (this.enLogin()) return;
    this.notif.inbox({ pageSize: 10 }).subscribe({
      next: (r) => {
        this.unseenCount.set(r.unseen);
        this.inboxItems.set(r.data);
      },
      error: () => {},
    });
  }

  marcarTodasLeidas() { this.notif.marcarTodasLeidas().subscribe(() => this.cargarInbox()); }

  abrirNotif(n: NotifItem) {
    if (!n.seen) this.notif.marcarLeida(n.id).subscribe();
    if (n.accionUrl) void this.router.navigateByUrl(n.accionUrl);
    this.notifPopover.hide();
    setTimeout(() => this.cargarInbox(), 500);
  }
}

function leerMenuExpandido(): boolean {
  try {
    return localStorage.getItem(CLAVE_MENU_EXPANDIDO) === "1";
  } catch {
    return false;
  }
}

function esRutaLogin(url: string): boolean {
  return url === "/login" || url.startsWith("/login/") || url.startsWith("/login?");
}
