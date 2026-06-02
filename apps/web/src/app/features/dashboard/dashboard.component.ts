import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  DashboardApiService,
  DashboardKpis,
  TimelinePoint,
  PorCompetencia,
  CargaAbogado,
  PorMes,
} from "../../core/services/dashboard.service";

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

      <!-- Distribución por competencia (donut SVG) + Top abogados -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:24px;">
        <mat-card>
          <mat-card-header><mat-card-title>Atenciones por competencia</mat-card-title></mat-card-header>
          <mat-card-content style="display:flex; gap:16px; align-items:center;">
            <svg viewBox="0 0 100 100" style="width:140px; height:140px;" *ngIf="porCompetencia().length">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#eee" stroke-width="20" />
              <ng-container *ngFor="let arc of donutArcs(); let i = index">
                <circle
                  cx="50" cy="50" r="40" fill="none" stroke-width="20"
                  [attr.stroke]="arc.color"
                  [attr.stroke-dasharray]="arc.dash"
                  [attr.stroke-dashoffset]="arc.offset"
                  transform="rotate(-90 50 50)"
                />
              </ng-container>
            </svg>
            <div style="flex:1;">
              <div *ngFor="let row of donutLegend(); let i = index" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span [style.background]="row.color" style="width:12px; height:12px; border-radius:2px;"></span>
                <span style="flex:1;">{{ row.competencia }}</span>
                <span><strong>{{ row.total }}</strong> ({{ row.pct.toFixed(0) }}%)</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card>
          <mat-card-header><mat-card-title>Carga por abogado (top {{ cargaAbogados().length }})</mat-card-title></mat-card-header>
          <mat-card-content>
            <div *ngFor="let a of cargaAbogados()" style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid #eee;">
              <mat-icon style="opacity:0.5;">person</mat-icon>
              <span style="flex:1;">{{ a.email }}</span>
              <span style="opacity:0.6; font-size:12px;">{{ a.total }} totales</span>
              <span [style.color]="a.activas > 10 ? '#d32f2f' : '#1976d2'"><strong>{{ a.activas }}</strong> activas</span>
            </div>
            <p *ngIf="!cargaAbogados().length" style="opacity:0.5;">Sin atenciones asignadas.</p>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Tendencia 12 meses (bar chart minimal) -->
      <mat-card style="margin-top:24px;">
        <mat-card-header><mat-card-title>Atenciones por mes (últimos 12)</mat-card-title></mat-card-header>
        <mat-card-content>
          <svg viewBox="0 0 600 140" style="width:100%; height:140px;" *ngIf="porMes().length">
            <g *ngFor="let bar of monthBars(); let i = index">
              <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h" fill="#1976d2" />
              <text [attr.x]="bar.x + bar.w / 2" y="135" text-anchor="middle" font-size="9" fill="#666">{{ bar.label }}</text>
              <text [attr.x]="bar.x + bar.w / 2" [attr.y]="bar.y - 4" text-anchor="middle" font-size="9" fill="#1976d2">{{ bar.value }}</text>
            </g>
          </svg>
          <p *ngIf="!porMes().length" style="opacity:0.5;">Sin datos.</p>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(DashboardApiService);

  protected kpis = signal<DashboardKpis | null>(null);
  protected timeline = signal<TimelinePoint[]>([]);
  protected porCompetencia = signal<PorCompetencia[]>([]);
  protected cargaAbogados = signal<CargaAbogado[]>([]);
  protected porMes = signal<PorMes[]>([]);
  protected loading = signal(true);

  // Paleta para donut/leyenda. Repite si hay > 9 categorías.
  private readonly DONUT_COLORS = [
    "#1976d2", "#388e3c", "#fbc02d", "#7b1fa2", "#d32f2f",
    "#00897b", "#f57c00", "#5d4037", "#455a64",
  ];

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

  // Donut chart: cada arco es un círculo con stroke-dasharray que define
  // la porción visible y stroke-dashoffset que la rota. Circunferencia
  // 2πr = 2π·40 ≈ 251.33.
  protected readonly CIRC = 2 * Math.PI * 40;

  protected donutLegend = computed(() => {
    const rows = this.porCompetencia();
    const total = rows.reduce((s, r) => s + r.total, 0) || 1;
    return rows.map((r, i) => ({
      ...r,
      color: this.DONUT_COLORS[i % this.DONUT_COLORS.length],
      pct: (r.total / total) * 100,
    }));
  });

  protected donutArcs = computed(() => {
    const rows = this.donutLegend();
    const total = rows.reduce((s, r) => s + r.total, 0) || 1;
    let offset = 0;
    return rows.map((r) => {
      const portion = (r.total / total) * this.CIRC;
      const arc = {
        color: r.color,
        dash: `${portion} ${this.CIRC - portion}`,
        offset: -offset,
      };
      offset += portion;
      return arc;
    });
  });

  protected monthBars = computed(() => {
    const pts = this.porMes();
    if (!pts.length) return [];
    const max = Math.max(...pts.map((p) => p.total), 1);
    const W = 600;
    const H = 110;
    const padding = 20;
    const stepX = (W - 2 * padding) / pts.length;
    return pts.map((p, i) => {
      const h = (p.total / max) * H;
      return {
        x: padding + i * stepX + 4,
        y: H - h + 10,
        w: stepX - 8,
        h,
        label: p.mes.slice(5), // MM
        value: p.total,
      };
    });
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
    this.api.porCompetencia().subscribe((r) => this.porCompetencia.set(r));
    this.api.cargaAbogados(10).subscribe((r) => this.cargaAbogados.set(r));
    this.api.porMes(12).subscribe((r) => this.porMes.set(r));
  }
}
