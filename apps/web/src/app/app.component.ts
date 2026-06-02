import { Component, OnInit, ViewChild, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
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

@Component({
  selector: "lm-root",
  standalone: true,
  imports: [
    CommonModule,
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
    <div style="display:flex; height:100vh; overflow:hidden;">
      <!-- Sidebar desktop -->
      <aside class="lm-sidebar" *ngIf="!isMobile()">
        <div class="lm-app-header">
          <img src="assets/logo.svg" alt="LegalChile" style="width:32px; height:32px;" />
          <span>LegalChile</span>
        </div>
        <nav>
          <a routerLink="/dashboard" routerLinkActive="active">
            <i class="pi pi-th-large"></i> Dashboard
          </a>
          <a routerLink="/afiliados" routerLinkActive="active">
            <i class="pi pi-users"></i> Afiliados
          </a>
          <a routerLink="/atenciones" routerLinkActive="active">
            <i class="pi pi-briefcase"></i> Atenciones
          </a>
          <a routerLink="/gestiones" routerLinkActive="active">
            <i class="pi pi-check-square"></i> Gestiones
          </a>
          <a routerLink="/cargas-masivas" routerLinkActive="active">
            <i class="pi pi-cloud-upload"></i> Cargas masivas
          </a>
          <a routerLink="/pagos" routerLinkActive="active">
            <i class="pi pi-credit-card"></i> Pagos
          </a>
          <a routerLink="/auditoria" routerLinkActive="active">
            <i class="pi pi-history"></i> Auditoría
          </a>
          <a
            routerLink="/admin/usuarios"
            routerLinkActive="active"
            *ngIf="me.user()?.rol === 'Administrador'"
          >
            <i class="pi pi-shield"></i> Usuarios
          </a>
          <a
            routerLink="/admin/webhooks"
            routerLinkActive="active"
            *ngIf="me.user()?.rol === 'Administrador'"
          >
            <i class="pi pi-link"></i> Webhooks
          </a>
        </nav>
      </aside>

      <!-- Sidebar móvil con drawer -->
      <p-drawer
        [(visible)]="mobileDrawerVisible"
        position="left"
        [style]="{ width: '240px' }"
        *ngIf="isMobile()"
        [showCloseIcon]="false"
      >
        <ng-template pTemplate="header">
          <div class="lm-app-header" style="margin:-16px -16px 8px; width:calc(100% + 32px);">
            <img src="assets/logo.svg" alt="LegalChile" style="width:32px; height:32px;" />
            <span>LegalChile</span>
          </div>
        </ng-template>
        <nav class="lm-sidebar" style="border:none; width:auto; height:auto;" (click)="mobileDrawerVisible = false">
          <a routerLink="/dashboard" routerLinkActive="active"><i class="pi pi-th-large"></i> Dashboard</a>
          <a routerLink="/afiliados" routerLinkActive="active"><i class="pi pi-users"></i> Afiliados</a>
          <a routerLink="/atenciones" routerLinkActive="active"><i class="pi pi-briefcase"></i> Atenciones</a>
          <a routerLink="/gestiones" routerLinkActive="active"><i class="pi pi-check-square"></i> Gestiones</a>
          <a routerLink="/cargas-masivas" routerLinkActive="active"><i class="pi pi-cloud-upload"></i> Cargas masivas</a>
          <a routerLink="/pagos" routerLinkActive="active"><i class="pi pi-credit-card"></i> Pagos</a>
          <a routerLink="/auditoria" routerLinkActive="active"><i class="pi pi-history"></i> Auditoría</a>
          <a routerLink="/admin/usuarios" routerLinkActive="active" *ngIf="me.user()?.rol === 'Administrador'">
            <i class="pi pi-shield"></i> Usuarios
          </a>
          <a routerLink="/admin/webhooks" routerLinkActive="active" *ngIf="me.user()?.rol === 'Administrador'">
            <i class="pi pi-link"></i> Webhooks
          </a>
        </nav>
      </p-drawer>

      <!-- Contenido principal -->
      <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
        <div
          *ngIf="maint.active()"
          style="background:#fff4e0; border-bottom:1px solid #f9b04c; padding:8px 16px; display:flex; align-items:center; gap:8px;"
        >
          <i class="pi pi-exclamation-triangle" style="color:#c66400;"></i>
          <span>
            Sistema en mantenimiento: las acciones de escritura están temporalmente
            deshabilitadas.
          </span>
        </div>

        <header class="lm-toolbar">
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
          <span style="font-weight:600;">Sistema PSL</span>
          <span class="lm-muted" *ngIf="codPlan.codPlan() as cp" style="margin-left:12px;">Plan: {{ cp }}</span>
          <span style="flex: 1"></span>

          <!-- Notificaciones -->
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
                  pButton
                  type="button"
                  label="Marcar todas leídas"
                  [text]="true"
                  size="small"
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
                  n.severidad === 'critical'
                    ? '4px solid #d32f2f'
                    : n.severidad === 'warn'
                      ? '4px solid #fbc02d'
                      : '4px solid #1976d2'
                "
                [style.background]="n.seen ? 'transparent' : 'rgba(25, 118, 210, 0.04)'"
              >
                <strong [style.fontWeight]="n.seen ? 'normal' : '600'">{{ n.titulo }}</strong>
                <small *ngIf="n.detalle" style="opacity:0.7;">{{ n.detalle }}</small>
                <small style="opacity:0.5;">{{ n.createdAt | date: 'short' }}</small>
              </div>
            </div>
          </p-popover>

          <!-- Usuario -->
          <ng-container *ngIf="me.user() as user; else loggingIn">
            <button
              pButton
              type="button"
              [text]="true"
              severity="secondary"
              (click)="abrirUserPopover($event)"
            >
              <i class="pi pi-user" style="margin-right:6px;"></i>
              <span *ngIf="!isMobile()">{{ user.nombre }} · {{ user.rol }}</span>
            </button>
            <p-popover #userPopover>
              <div style="min-width:220px;">
                <div style="padding:8px 4px; border-bottom:1px solid #eee; font-size:13px; color:#475569;">
                  {{ user.email }}
                </div>
                <div style="padding-top:8px;">
                  <div
                    *ngFor="let p of user.codPlanes"
                    (click)="codPlan.set(p); userPopover.hide()"
                    style="display:flex; align-items:center; gap:8px; padding:8px 4px; cursor:pointer; border-radius:4px;"
                    [style.background]="p === codPlan.codPlan() ? '#eff6ff' : 'transparent'"
                  >
                    <i class="pi pi-check" *ngIf="p === codPlan.codPlan()" style="color:#1976d2;"></i>
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

        <main class="page" style="flex:1; overflow:auto;">
          <router-outlet />
        </main>
      </div>
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

  ngOnInit() {
    this.me.load();
    this.cargarInbox();
    this.breakpoints
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .subscribe((r) => this.isMobile.set(r.matches));
    setInterval(() => this.cargarInbox(), 60_000);
  }

  abrirNotifPopover(ev: Event) {
    this.notifPopover.toggle(ev);
  }

  abrirUserPopover(ev: Event) {
    this.userPopover.toggle(ev);
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

  marcarTodasLeidas() {
    this.notif.marcarTodasLeidas().subscribe(() => this.cargarInbox());
  }

  abrirNotif(n: NotifItem) {
    if (!n.seen) this.notif.marcarLeida(n.id).subscribe();
    if (n.accionUrl) void this.router.navigateByUrl(n.accionUrl);
    this.notifPopover.hide();
    setTimeout(() => this.cargarInbox(), 500);
  }
}
