import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatListModule } from "@angular/material/list";

@Component({
  selector: "lm-root",
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
  ],
  template: `
    <mat-sidenav-container style="height: 100vh">
      <mat-sidenav mode="side" opened style="width: 220px">
        <mat-toolbar color="primary">LegalChile</mat-toolbar>
        <mat-nav-list>
          <a mat-list-item routerLink="/dashboard" routerLinkActive="active">
            <mat-icon>dashboard</mat-icon> Dashboard
          </a>
          <a mat-list-item routerLink="/afiliados" routerLinkActive="active">
            <mat-icon>people</mat-icon> Afiliados
          </a>
          <a mat-list-item routerLink="/atenciones" routerLinkActive="active">
            <mat-icon>gavel</mat-icon> Atenciones
          </a>
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar>
          <span>Sistema PSL</span>
          <span style="flex: 1"></span>
          <button mat-icon-button><mat-icon>notifications</mat-icon></button>
          <button mat-icon-button><mat-icon>account_circle</mat-icon></button>
        </mat-toolbar>
        <main class="page">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`.active { background: rgba(0, 0, 0, 0.08); }`],
})
export class AppComponent {}
