import { Component, OnInit, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSidenav, MatSidenavModule } from "@angular/material/sidenav";
import { MatListModule } from "@angular/material/list";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatBadgeModule } from "@angular/material/badge";
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { Router } from "@angular/router";
import { MeService } from "./core/services/me.service";
import { CodPlanService } from "./core/services/cod-plan.service";
import { MaintenanceService } from "./core/services/maintenance.service";
import { NotifInboxApiService, NotifItem } from "./core/services/notif-inbox.service";
import { signal } from "@angular/core";

@Component({
  selector: "lm-root",
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatMenuModule,
    MatTooltipModule,
    MatBadgeModule,
  ],
  template: `
    <mat-sidenav-container style="height: 100vh">
      <mat-sidenav
        #sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
        style="width: 220px"
      >
        <mat-toolbar color="primary" style="gap:10px; align-items:center;">
          <img src="assets/logo.svg" alt="LegalChile" style="width:32px; height:32px;" />
          <span>LegalChile</span>
        </mat-toolbar>
        <mat-nav-list (click)="isMobile() && sidenav.close()">
          <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
            <mat-icon matListItemIcon>dashboard</mat-icon> Dashboard
          </a>
          <a mat-list-item routerLink="/afiliados" routerLinkActive="active">
            <mat-icon matListItemIcon>people</mat-icon> Afiliados
          </a>
          <a mat-list-item routerLink="/atenciones" routerLinkActive="active">
            <mat-icon matListItemIcon>gavel</mat-icon> Atenciones
          </a>
          <a mat-list-item routerLink="/gestiones" routerLinkActive="active">
            <mat-icon matListItemIcon>task_alt</mat-icon> Gestiones
          </a>
          <a mat-list-item routerLink="/cargas-masivas" routerLinkActive="active">
            <mat-icon matListItemIcon>cloud_upload</mat-icon> Cargas masivas
          </a>
          <a mat-list-item routerLink="/pagos" routerLinkActive="active">
            <mat-icon matListItemIcon>payments</mat-icon> Pagos
          </a>
          <a mat-list-item routerLink="/auditoria" routerLinkActive="active">
            <mat-icon matListItemIcon>history</mat-icon> Auditoría
          </a>
          <a
            mat-list-item
            routerLink="/admin/usuarios"
            routerLinkActive="active"
            *ngIf="me.user()?.rol === 'Administrador'"
          >
            <mat-icon matListItemIcon>admin_panel_settings</mat-icon> Usuarios
          </a>
          <a
            mat-list-item
            routerLink="/admin/webhooks"
            routerLinkActive="active"
            *ngIf="me.user()?.rol === 'Administrador'"
          >
            <mat-icon matListItemIcon>webhook</mat-icon> Webhooks
          </a>
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <div
          *ngIf="maint.active()"
          style="background:#fff4e0; border-bottom:1px solid #f9b04c; padding:8px 16px; display:flex; align-items:center; gap:8px;"
        >
          <mat-icon style="color:#c66400;">warning</mat-icon>
          <span>
            Sistema en mantenimiento: las acciones de escritura están temporalmente
            deshabilitadas.
          </span>
        </div>
        <mat-toolbar>
          <button
            mat-icon-button
            *ngIf="isMobile()"
            (click)="sidenav.toggle()"
            aria-label="Abrir menú"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <span>Sistema PSL</span>
          <span class="muted" *ngIf="codPlan.codPlan() as cp" style="margin-left:12px; opacity:0.6;">Plan: {{ cp }}</span>
          <span style="flex: 1"></span>
          <button
            mat-icon-button
            [matMenuTriggerFor]="notifMenu"
            [matBadge]="unseenCount() || ''"
            [matBadgeHidden]="unseenCount() === 0"
            matBadgeColor="warn"
            matBadgeSize="small"
            matTooltip="Notificaciones"
            (menuOpened)="cargarInbox()"
          >
            <mat-icon>notifications</mat-icon>
          </button>
          <mat-menu #notifMenu="matMenu" xPosition="before">
            <div style="display:flex; align-items:center; gap:8px; padding:8px 16px; border-bottom:1px solid #eee;">
              <strong style="flex:1;">Notificaciones</strong>
              <button
                mat-button
                color="primary"
                *ngIf="unseenCount() > 0"
                (click)="$event.stopPropagation(); marcarTodasLeidas()"
              >
                Marcar todas leídas
              </button>
            </div>
            <div style="padding:16px; min-width:320px;" *ngIf="!inboxItems().length">
              <em style="opacity:0.6;">Sin notificaciones</em>
            </div>
            <button
              mat-menu-item
              *ngFor="let n of inboxItems()"
              (click)="abrirNotif(n)"
              [style.borderLeft]="
                n.severidad === 'critical'
                  ? '4px solid #d32f2f'
                  : n.severidad === 'warn'
                    ? '4px solid #fbc02d'
                    : '4px solid #1976d2'
              "
              [style.background]="n.seen ? 'transparent' : 'rgba(25, 118, 210, 0.04)'"
            >
              <div style="display:flex; flex-direction:column; padding:4px 0; min-width:280px;">
                <strong [style.fontWeight]="n.seen ? 'normal' : 'bold'">{{ n.titulo }}</strong>
                <small *ngIf="n.detalle" style="opacity:0.7;">{{ n.detalle }}</small>
                <small style="opacity:0.5;">{{ n.createdAt | date: 'short' }}</small>
              </div>
            </button>
          </mat-menu>
          <ng-container *ngIf="me.user() as user; else loggingIn">
            <button mat-button [matMenuTriggerFor]="userMenu">
              <mat-icon>account_circle</mat-icon>
              <span *ngIf="!isMobile()" style="margin-left:4px;">{{ user.nombre }} · {{ user.rol }}</span>
            </button>
            <mat-menu #userMenu="matMenu">
              <button mat-menu-item disabled>{{ user.email }}</button>
              <button mat-menu-item *ngFor="let p of user.codPlanes" (click)="codPlan.set(p)">
                <mat-icon *ngIf="p === codPlan.codPlan()">check</mat-icon>
                <span [style.padding-left.px]="p === codPlan.codPlan() ? 0 : 24">Plan {{ p }}</span>
              </button>
            </mat-menu>
          </ng-container>
          <ng-template #loggingIn>
            <span style="opacity:0.5;">Cargando…</span>
          </ng-template>
        </mat-toolbar>
        <main class="page">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`.active { background: rgba(0, 0, 0, 0.08); }`],
})
export class AppComponent implements OnInit {
  protected me = inject(MeService);
  protected codPlan = inject(CodPlanService);
  protected maint = inject(MaintenanceService);
  private notif = inject(NotifInboxApiService);
  private router = inject(Router);
  private breakpoints = inject(BreakpointObserver);

  @ViewChild("sidenav") private sidenav!: MatSidenav;

  protected unseenCount = signal(0);
  protected inboxItems = signal<NotifItem[]>([]);
  protected isMobile = signal(false);

  ngOnInit() {
    this.me.load();
    this.cargarInbox();
    this.breakpoints
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .subscribe((r) => this.isMobile.set(r.matches));
    // Refresca cada 60s para mantener el badge actualizado.
    setInterval(() => this.cargarInbox(), 60_000);
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
    setTimeout(() => this.cargarInbox(), 500);
  }
}
