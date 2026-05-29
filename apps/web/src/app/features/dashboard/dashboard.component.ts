import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { DashboardApiService, DashboardKpis, TimelinePoint } from "../../core/services/dashboard.service";

@Component({
  selector: "lm-dashboard",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h1 style="display:flex; align-items:center; gap:12px;">
      Dashboard
      <small *ngIf="kpis() as k" style="opacity:0.5; font-weight:normal;">plan {{ k.codPlan }}</small>
    </h1>

    <div *ngIf="loading()" style="display:flex; justify-content:center; padding:48px;">
      <mat-progress-spinner mode="indeterminate" diameter="48"></mat-progress-spinner>
    </div>

    <ng-container *ngIf="kpis() as k">
      <!-- Primary KPIs -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:24px;">
        <mat-card>
          <mat-card-content>
            <div style="display:flex; align-items:center; gap:12px;">
              <mat-icon style="font-size:40px; width:40px; height:40px; color:#1976d2;">people</mat-icon>
              <div>
                <div style="font-size:28px; font-weight:600;">{{ k.afiliados.activos }}</div>
                <div style="opacity:0.7;">Afiliados activos</div>
                <small style="opacity:0.5;">{{ k.afiliados.total }} totales · {{ k.afiliados.eliminados }} eliminados</small>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-content>
            <div style="display:flex; align-items:center; gap:12px;">
              <mat-icon style="font-size:40px; width:40px; height:40px; color:#1976d2;">gavel</mat-icon>
              <div>
                <div style="font-size:28px; font-weight:600;">{{ k.atenciones.abiertas + k.atenciones.enGestion + k.atenciones.enComite }}</div>
                <div style="opacity:0.7;">Atenciones activas</div>
                <small style="opacity:0.5;">{{ k.atenciones.total }} totales</small>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-content>
            <div style="display:flex; align-items:center; gap:12px;">
              <mat-icon style="font-size:40px; width:40px; height:40px;" [style.color]="k.gestiones.vencidas ? '#d32f2f' : '#1976d2'">schedule</mat-icon>
              <div>
                <div style="font-size:28px; font-weight:600;">{{ k.gestiones.pendientes }}</div>
                <div style="opacity:0.7;">Gestiones pendientes</div>
                <small *ngIf="k.gestiones.vencidas" style="color:#d32f2f;">{{ k.gestiones.vencidas }} vencidas</small>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-content>
            <div style="display:flex; align-items:center; gap:12px;">
              <mat-icon style="font-size:40px; width:40px; height:40px; color:#1976d2;">how_to_vote</mat-icon>
              <div>
                <div style="font-size:28px; font-weight:600;">{{ k.comites.abiertos }}</div>
                <div style="opacity:0.7;">Comités abiertos</div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Atenciones por tipo + estado -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px;">
        <mat-card>
          <mat-card-header><mat-card-title>Atenciones por tipo</mat-card-title></mat-card-header>
          <mat-card-content>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <ng-container *ngFor="let row of porTipo()">
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="width:80px; opacity:0.7;">{{ row.label }}</div>
                  <div style="flex:1; background:#eee; border-radius:4px; height:24px; overflow:hidden;">
                    <div [style.width.%]="row.pct" style="background:#1976d2; height:100%;"></div>
                  </div>
                  <div style="width:48px; text-align:right;">{{ row.value }}</div>
                </div>
              </ng-container>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header><mat-card-title>Atenciones por estado</mat-card-title></mat-card-header>
          <mat-card-content>
            <div style="display:flex; flex-direction:column; gap:8px;">
              <ng-container *ngFor="let row of porEstado()">
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="width:100px; opacity:0.7;">{{ row.label }}</div>
                  <div style="flex:1; background:#eee; border-radius:4px; height:24px; overflow:hidden;">
                    <div [style.width.%]="row.pct" [style.background]="row.color" style="height:100%;"></div>
                  </div>
                  <div style="width:48px; text-align:right;">{{ row.value }}</div>
                </div>
              </ng-container>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Timeline sparkline -->
      <mat-card>
        <mat-card-header>
          <mat-card-title>Atenciones creadas (últimos 30 días)</mat-card-title>
          <mat-card-subtitle>{{ k.atenciones.creadasUltimos30Dias }} en total · {{ k.atenciones.creadasHoy }} hoy</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <svg [attr.viewBox]="'0 0 ' + sparkW + ' ' + sparkH" style="width:100%; height:120px;" *ngIf="timeline().length">
            <polyline [attr.points]="sparkPoints()" fill="none" stroke="#1976d2" stroke-width="2"></polyline>
            <ng-container *ngFor="let pt of sparkDots(); let i = index">
              <circle [attr.cx]="pt.x" [attr.cy]="pt.y" r="3" fill="#1976d2"></circle>
            </ng-container>
          </svg>
          <p *ngIf="!timeline().length" style="opacity:0.5;">Sin datos en el período.</p>
        </mat-card-content>
        <mat-card-actions>
          <a mat-button routerLink="/atenciones">Ver atenciones →</a>
        </mat-card-actions>
      </mat-card>
    </ng-container>
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(DashboardApiService);

  protected kpis = signal<DashboardKpis | null>(null);
  protected timeline = signal<TimelinePoint[]>([]);
  protected loading = signal(true);

  protected readonly sparkW = 600;
  protected readonly sparkH = 100;

  protected porTipo = computed(() => {
    const k = this.kpis();
    if (!k) return [];
    const max = Math.max(k.atenciones.porTipo.Consulta, k.atenciones.porTipo.Asesoria, k.atenciones.porTipo.Juicio, 1);
    return [
      { label: "Consultas", value: k.atenciones.porTipo.Consulta, pct: (k.atenciones.porTipo.Consulta / max) * 100 },
      { label: "Asesorías", value: k.atenciones.porTipo.Asesoria, pct: (k.atenciones.porTipo.Asesoria / max) * 100 },
      { label: "Juicios", value: k.atenciones.porTipo.Juicio, pct: (k.atenciones.porTipo.Juicio / max) * 100 },
    ];
  });

  protected porEstado = computed(() => {
    const k = this.kpis();
    if (!k) return [];
    const t = k.atenciones;
    const max = Math.max(t.abiertas, t.enGestion, t.enComite, t.cerradas, 1);
    return [
      { label: "Abiertas", value: t.abiertas, pct: (t.abiertas / max) * 100, color: "#1976d2" },
      { label: "En gestión", value: t.enGestion, pct: (t.enGestion / max) * 100, color: "#fbc02d" },
      { label: "En comité", value: t.enComite, pct: (t.enComite / max) * 100, color: "#7b1fa2" },
      { label: "Cerradas", value: t.cerradas, pct: (t.cerradas / max) * 100, color: "#388e3c" },
    ];
  });

  protected sparkPoints = computed(() => this.sparkDots().map((p) => `${p.x},${p.y}`).join(" "));

  protected sparkDots = computed(() => {
    const pts = this.timeline();
    if (!pts.length) return [];
    const max = Math.max(...pts.map((p) => p.total), 1);
    const stepX = pts.length > 1 ? this.sparkW / (pts.length - 1) : 0;
    return pts.map((p, i) => ({
      x: i * stepX,
      y: this.sparkH - (p.total / max) * (this.sparkH - 10) - 5,
    }));
  });

  ngOnInit() {
    this.api.kpis().subscribe({
      next: (k) => {
        this.kpis.set(k);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.timeline(30).subscribe((t) => this.timeline.set(t));
  }
}
