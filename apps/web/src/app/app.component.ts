import { Component, OnInit, ViewChild, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from "@angular/router";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { ButtonModule } from "primeng/button";
import { DrawerModule } from "primeng/drawer";
import { PopoverModule } from "primeng/popover";
import { OverlayBadgeModule } from "primeng/overlaybadge";
import { TooltipModule } from "primeng/tooltip";
import { Popover } from "primeng/popover";
import { ConfirmDialogModule } from "primeng/confirmdialog";
import { ToastModule } from "primeng/toast";
import { MeService } from "./core/services/me.service";
import { CodPlanService } from "./core/services/cod-plan.service";
import { MaintenanceService } from "./core/services/maintenance.service";
import { NotifInboxApiService, NotifItem } from "./core/services/notif-inbox.service";

interface NavItem {
  label: string;
  icon: string;
  route: string;
  rol?: string;
}

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

      <div class="lm-brand">
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
            <small>{{ user.rol }}</small>
          </div>
          <div class="lm-avatar">{{ avatarIniciales(user.nombre) }}</div>
        </div>
        <p-popover #userPopover>
          <div style="min-width:240px;">
            <div style="padding:6px 4px; border-bottom:1px solid #eee; font-size:13px; color:#475569;">
              {{ user.email }}
            </div>
            <div *ngIf="codPlan.codPlan() as cp" class="lm-small" style="padding:8px 4px;">
              Plan activo: <strong style="color:#2563eb;">{{ cp }}</strong>
            </div>
            <div style="padding-top:4px;">
              <strong class="lm-small" style="padding:4px;">Cambiar plan</strong>
              <div
                *ngFor="let p of user.codPlanes"
                (click)="codPlan.set(p); userPopover.hide()"
                style="display:flex; align-items:center; gap:8px; padding:8px 4px; cursor:pointer; border-radius:6px;"
                [style.background]="p === codPlan.codPlan() ? '#eff6ff' : 'transparent'"
              >
                <i class="pi pi-check" *ngIf="p === codPlan.codPlan()" style="color:#2563eb;"></i>
                <span [style.padding-left.px]="p === codPlan.codPlan() ? 0 : 20">Plan {{ p }}</span>
              </div>
            </div>
          </div>
        </p-popover>
      </ng-container>
      <ng-template #loggingIn>
        <span class="lm-muted">Cargando…</span>
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

    <!-- Body: sidebar + content -->
    <div style="display:flex; height:calc(100vh - 64px); overflow:hidden;">
      <aside class="lm-sidebar" *ngIf="!isMobile()">
        <nav>
          <ng-container *ngFor="let item of menu()">
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              *ngIf="!item.rol || me.user()?.rol === item.rol"
            >
              <i class="pi {{ item.icon }}"></i> {{ item.label }}
            </a>
          </ng-container>
        </nav>
        <div class="lm-sidebar-footer">
          <i class="pi pi-angle-double-left"></i> Colapsar menú
        </div>
      </aside>

      <p-drawer
        [(visible)]="mobileDrawerVisible"
        position="left"
        [style]="{ width: '260px' }"
        *ngIf="isMobile()"
      >
        <nav class="lm-sidebar" style="border:none; width:auto;" (click)="mobileDrawerVisible = false">
          <ng-container *ngFor="let item of menu()">
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              *ngIf="!item.rol || me.user()?.rol === item.rol"
            >
              <i class="pi {{ item.icon }}"></i> {{ item.label }}
            </a>
          </ng-container>
        </nav>
      </p-drawer>

      <main style="flex:1; overflow:auto;">
        <div class="page">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class AppComponent implements OnInit {
  protected me = inject(MeService);
  protected codPlan = inject(CodPlanService);
  protected maint = inject(MaintenanceService);
  private notif = inject(NotifInboxApiService);
  private router = inject(Router);
  private breakpoints = inject(BreakpointObserver);

  @ViewChild("notifPopover") private notifPopover!: Popover;
  @ViewChild("userPopover") private userPopover!: Popover;

  protected unseenCount = signal(0);
  protected inboxItems = signal<NotifItem[]>([]);
  protected isMobile = signal(false);
  protected mobileDrawerVisible = false;
  protected searchTerm = "";

  protected menu = computed<NavItem[]>(() => [
    { label: "Dashboard", icon: "pi-home", route: "/dashboard" },
    { label: "Afiliados", icon: "pi-users", route: "/afiliados" },
    { label: "Consultas", icon: "pi-comment", route: "/consultas" },
    { label: "Asesorías", icon: "pi-id-card", route: "/asesorias" },
    { label: "Juicios", icon: "pi-briefcase", route: "/juicios" },
    { label: "Aranceles", icon: "pi-dollar", route: "/aranceles" },
    { label: "Provisiones", icon: "pi-wallet", route: "/provisiones" },
    { label: "Documentos", icon: "pi-folder", route: "/documentos" },
    { label: "Reportes", icon: "pi-chart-bar", route: "/reportes" },
    { label: "Gestiones", icon: "pi-check-square", route: "/gestiones" },
    { label: "Cargas masivas", icon: "pi-cloud-upload", route: "/cargas-masivas" },
    { label: "Pagos", icon: "pi-credit-card", route: "/pagos" },
    { label: "Auditoría", icon: "pi-history", route: "/auditoria" },
    { label: "Usuarios", icon: "pi-shield", route: "/admin/usuarios", rol: "Administrador" },
    { label: "Webhooks", icon: "pi-link", route: "/admin/webhooks", rol: "Administrador" },
  ]);

  ngOnInit() {
    this.me.load();
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
    void this.router.navigate(["/reportes"], { queryParams: { q } });
  }

  avatarIniciales(nombre: string): string {
    const parts = nombre.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
  }

  cargarInbox() {
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
