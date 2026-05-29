import { Component, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatListModule } from "@angular/material/list";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MeService } from "./core/services/me.service";
import { CodPlanService } from "./core/services/cod-plan.service";

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
  ],
  template: `
    <mat-sidenav-container style="height: 100vh">
      <mat-sidenav mode="side" opened style="width: 220px">
        <mat-toolbar color="primary">LegalChile</mat-toolbar>
        <mat-nav-list>
          <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
            <mat-icon matListItemIcon>dashboard</mat-icon> Dashboard
          </a>
          <a mat-list-item routerLink="/afiliados" routerLinkActive="active">
            <mat-icon matListItemIcon>people</mat-icon> Afiliados
          </a>
          <a mat-list-item routerLink="/atenciones" routerLinkActive="active">
            <mat-icon matListItemIcon>gavel</mat-icon> Atenciones
          </a>
          <a mat-list-item routerLink="/cargas-masivas" routerLinkActive="active">
            <mat-icon matListItemIcon>cloud_upload</mat-icon> Cargas masivas
          </a>
          <a mat-list-item routerLink="/auditoria" routerLinkActive="active">
            <mat-icon matListItemIcon>history</mat-icon> Auditoría
          </a>
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar>
          <span>Sistema PSL</span>
          <span class="muted" *ngIf="codPlan.codPlan() as cp" style="margin-left:12px; opacity:0.6;">Plan: {{ cp }}</span>
          <span style="flex: 1"></span>
          <ng-container *ngIf="me.user() as user; else loggingIn">
            <button mat-button [matMenuTriggerFor]="userMenu">
              <mat-icon>account_circle</mat-icon>
              <span style="margin-left:4px;">{{ user.nombre }} · {{ user.rol }}</span>
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

  ngOnInit() {
    this.me.load();
  }
}
