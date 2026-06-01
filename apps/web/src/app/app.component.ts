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
import { MeService } from "./core/services/me.service";
import { CodPlanService } from "./core/services/cod-plan.service";
import { MaintenanceService } from "./core/services/maintenance.service";
import { NotificacionesApiService, NotifItem } from "./core/services/notificaciones.service";
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
            <mat-icon matListItemIcon>admin_panel_settings</mat-icon> Admin
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
            [matBadge]="notifCount() || ''"
            [matBadgeHidden]="notifCount() === 0"
            matBadgeColor="warn"
            matBadgeSize="small"
            matTooltip="Notificaciones"
          >
            <mat-icon>notifications</mat-icon>
          </button>
          <mat-menu #notifMenu="matMenu" xPosition="before">
            <div style="padding:8px 16px; min-width:280px;" *ngIf="!notifItems().length">
              <em style="opacity:0.6;">Sin notificaciones</em>
            </div>
            <button
              mat-menu-item
              *ngFor="let n of notifItems()"
              [style.borderLeft]="
                n.severidad === 'critical'
                  ? '4px solid #d32f2f'
                  : n.severidad === 'warn'
                    ? '4px solid #fbc02d'
                    : '4px solid #1976d2'
              "
            >
              <div style="display:flex; flex-direction:column; padding:4px 0;">
                <strong>{{ n.titulo }}</strong>
                <small *ngIf="n.detalle" style="opacity:0.7;">{{ n.detalle }}</small>
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
  private notif = inject(NotificacionesApiService);
  private breakpoints = inject(BreakpointObserver);

  @ViewChild("sidenav") private sidenav!: MatSidenav;

  protected notifCount = signal(0);
  protected notifItems = signal<NotifItem[]>([]);
  protected isMobile = signal(false);

  ngOnInit() {
    this.me.load();
    this.loadNotif();
    this.breakpoints
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .subscribe((r) => this.isMobile.set(r.matches));
    // Refresca cada 60s para mantener el badge actualizado.
    setInterval(() => this.loadNotif(), 60_000);
  }

  private loadNotif() {
    this.notif.obtener().subscribe({
      next: (r) => {
        this.notifCount.set(r.count);
        this.notifItems.set(r.items);
      },
      error: () => {},
    });
  }
}
