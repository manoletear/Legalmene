import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { TagModule } from "primeng/tag";
import { MeService } from "../../core/services/me.service";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import type { AtencionListada } from "@legalmene/shared";
import {
  DashboardApiService,
  DashboardKpis,
  TimelinePoint,
  PorCompetencia,
  CargaAbogado,
  PorMes,
} from "../../core/services/dashboard.service";
import { estadoLabel as etiquetaEstado, estadoSeverity as severidadEstado } from "../../shared/estado-atencion";


@Component({
  selector: "lm-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink, CardModule, ButtonModule, ProgressSpinnerModule, TagModule],
  template: `
    <!-- Saludo -->
    <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px;">
      <div>
        <h1 style="margin:0 0 4px 0;">¡Buenos días, {{ primerNombre() }}!</h1>
        <p class="lm-muted" style="margin:0;">
          Resumen operativo al {{ hoy() | date: 'dd' }} de {{ hoy() | date: 'MMMM' }} de {{ hoy() | date: 'yyyy' }}, {{ hoy() | date: 'shortTime' }}
        </p>
      </div>
      <div
        style="display:flex; align-items:center; gap:8px; background:#fff; border:1px solid #e2e8f0; padding:8px 14px; border-radius:8px; cursor:pointer;"
      >
        <i class="pi pi-calendar" style="color:#2563eb;"></i>
        <span style="font-size:14px; font-weight:500;">{{ hoy() | date: 'dd' }} de {{ hoy() | date: 'MMMM' }} de {{ hoy() | date: 'yyyy' }}</span>
        <i class="pi pi-chevron-down" style="font-size:12px; color:#94a3b8;"></i>
      </div>
    </div>

    <div *ngIf="loading()" style="display:flex; justify-content:center; padding:48px;">
      <p-progressSpinner strokeWidth="4"></p-progressSpinner>
    </div>

    <ng-container *ngIf="kpis() as k">
      <!-- 4 KPIs principales -->
      <div class="lm-grid lm-grid-4" style="margin-bottom:20px;">
        <p-card styleClass="lm-kpi-card">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="lm-kpi-icon blue"><i class="pi pi-folder-open"></i></div>
            <div style="flex:1;">
              <div class="lm-kpi-label">Casos abiertos <i class="pi pi-info-circle lm-muted" style="font-size:11px;"></i></div>
              <div class="lm-kpi-value lm-mono">{{ casosAbiertos(k) | number }}</div>
              <span class="lm-small lm-muted">{{ k.atenciones.creadasHoy | number }} ingresadas hoy</span>
            </div>
          </div>
        </p-card>

        <p-card styleClass="lm-kpi-card">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="lm-kpi-icon green"><i class="pi pi-comment"></i></div>
            <div style="flex:1;">
              <div class="lm-kpi-label">Consultas del día <i class="pi pi-info-circle lm-muted" style="font-size:11px;"></i></div>
              <div class="lm-kpi-value lm-mono">{{ k.atenciones.consultasHoy | number }}</div>
              <span class="lm-kpi-delta" [class.up]="deltaConsultas(k) > 0" [class.down]="deltaConsultas(k) < 0">
                <i *ngIf="deltaConsultas(k) !== 0" class="pi" [class.pi-arrow-up]="deltaConsultas(k) > 0" [class.pi-arrow-down]="deltaConsultas(k) < 0"></i>
                {{ deltaConsultas(k) > 0 ? "+" : "" }}{{ deltaConsultas(k) }} vs. ayer ({{ k.atenciones.consultasAyer }})
              </span>
            </div>
          </div>
        </p-card>

        <p-card styleClass="lm-kpi-card">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="lm-kpi-icon orange"><i class="pi pi-clock"></i></div>
            <div style="flex:1;">
              <div class="lm-kpi-label">SLA por vencer <i class="pi pi-info-circle lm-muted" style="font-size:11px;"></i></div>
              <div class="lm-kpi-value lm-mono">{{ k.gestiones.porVencer | number }}</div>
              <span class="lm-small lm-muted">{{ k.gestiones.vencidas | number }} ya vencidas</span>
            </div>
          </div>
        </p-card>

        <p-card styleClass="lm-kpi-card">
          <div style="display:flex; align-items:center; gap:14px;">
            <div class="lm-kpi-icon purple"><i class="pi pi-wallet"></i></div>
            <div style="flex:1;">
              <div class="lm-kpi-label">Provisiones pendientes <i class="pi pi-info-circle lm-muted" style="font-size:11px;"></i></div>
              <div class="lm-kpi-value lm-mono">$ {{ k.provisiones.montoPendiente | number }}</div>
              <span class="lm-small lm-muted">{{ k.provisiones.pendientes }} por aprobar</span>
            </div>
          </div>
        </p-card>
      </div>

      <!-- Donut + Bar abogados -->
      <div class="lm-grid lm-grid-2" style="margin-bottom:20px;">
        <p-card>
          <ng-template pTemplate="header">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 16px 0;">
              <h3 style="margin:0;">Atenciones por estado <i class="pi pi-info-circle lm-muted" style="font-size:12px;"></i></h3>
              <span class="lm-small lm-muted">Atenciones visibles</span>
            </div>
          </ng-template>
          <div style="display:flex; gap:24px; align-items:center;">
            <svg viewBox="0 0 100 100" style="width:180px; height:180px; flex-shrink:0;" *ngIf="estadosBreakdown().length">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" stroke-width="16" />
              <ng-container *ngFor="let arc of donutArcs(); let i = index">
                <circle
                  cx="50" cy="50" r="40" fill="none" stroke-width="16"
                  [attr.stroke]="arc.color"
                  [attr.stroke-dasharray]="arc.dash"
                  [attr.stroke-dashoffset]="arc.offset"
                  transform="rotate(-90 50 50)"
                  stroke-linecap="butt"
                />
              </ng-container>
              <text x="50" y="48" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a">{{ porcentajePrincipal() }}%</text>
              <text x="50" y="62" text-anchor="middle" font-size="6" fill="#64748b">{{ estadosBreakdown()[0]?.label }}</text>
            </svg>
            <div style="flex:1;">
              <div *ngFor="let row of estadosBreakdown(); let i = index" style="display:flex; align-items:center; gap:10px; padding:6px 0;">
                <span [style.background]="row.color" style="width:10px; height:10px; border-radius:2px; flex-shrink:0;"></span>
                <span style="flex:1; color:#475569; font-size:14px;">{{ row.label }}</span>
                <span style="color:#0f172a; font-weight:600; font-size:14px;">
                  {{ row.pct.toFixed(0) }}% <span class="lm-muted lm-mono">({{ row.value | number }})</span>
                </span>
              </div>
              <div style="margin-top:8px; padding-top:8px; border-top:1px solid #f1f5f9; display:flex; justify-content:space-between;">
                <strong>Total</strong>
                <strong class="lm-mono">{{ totalAtenciones() | number }}</strong>
              </div>
            </div>
          </div>
        </p-card>

        <p-card>
          <ng-template pTemplate="header">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 16px 0;">
              <h3 style="margin:0;">Carga por abogado <i class="pi pi-info-circle lm-muted" style="font-size:12px;"></i></h3>
              <span class="lm-small lm-muted">Atenciones visibles</span>
            </div>
          </ng-template>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div *ngFor="let a of cargaAbogados().slice(0, 6)" style="display:flex; align-items:center; gap:10px;">
              <div style="width:120px; font-size:13px; color:#0f172a; font-weight:500; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                {{ nombreCorto(a.email) }}
              </div>
              <div style="flex:1; background:#f1f5f9; border-radius:4px; height:18px; position:relative;">
                <div [style.width.%]="barWidth(a.total)" style="background:#2563eb; height:100%; border-radius:4px;"></div>
              </div>
              <div style="width:40px; text-align:right; font-weight:600; font-size:13px; color:#0f172a;">{{ a.total }}</div>
            </div>
            <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:1px solid #f1f5f9; font-size:11px; color:#94a3b8;">
              <span>0</span><span>{{ maxCarga() }}</span>
            </div>
            <div style="text-align:center; font-size:11px; color:#94a3b8;">Atenciones</div>
          </div>
        </p-card>
      </div>

      <!-- Alertas + Casos recientes -->
      <div class="lm-grid lm-grid-2">
        <p-card>
          <ng-template pTemplate="header">
            <div style="padding:16px 16px 0;">
              <h3 style="margin:0;">Alertas y vencimientos <i class="pi pi-info-circle lm-muted" style="font-size:12px;"></i></h3>
            </div>
          </ng-template>
          <div>
            <div class="lm-alert-row">
              <div class="lm-alert-icon critical"><i class="pi pi-clock"></i></div>
              <div style="flex:1; font-size:14px; color:#475569;">{{ alertas().vencer3 }} gestiones con plazo en los próximos 3 días</div>
              <p-tag value="Crítico" severity="danger"></p-tag>
              <a routerLink="/gestiones" style="color:#2563eb; font-size:13px; font-weight:500; cursor:pointer; margin-left:8px;">Ver gestiones</a>
            </div>
            <div class="lm-alert-row">
              <div class="lm-alert-icon high"><i class="pi pi-clock"></i></div>
              <div style="flex:1; font-size:14px; color:#475569;">{{ alertas().escritos }} escritos con plazo de entrega en los próximos 5 días</div>
              <p-tag value="Alto" severity="warn"></p-tag>
              <a routerLink="/gestiones" style="color:#2563eb; font-size:13px; font-weight:500; cursor:pointer; margin-left:8px;">Ver gestiones</a>
            </div>
            <div class="lm-alert-row">
              <div class="lm-alert-icon info"><i class="pi pi-file"></i></div>
              <div style="flex:1; font-size:14px; color:#475569;">{{ alertas().provisiones }} provisiones pendientes de aprobación</div>
              <p-tag value="Medio" severity="info"></p-tag>
              <a routerLink="/provisiones" [queryParams]="{ estado: 'Solicitada' }" style="color:#2563eb; font-size:13px; font-weight:500; cursor:pointer; margin-left:8px;">Ver provisiones</a>
            </div>
            <div class="lm-alert-row">
              <div class="lm-alert-icon info"><i class="pi pi-users"></i></div>
              <div style="flex:1; font-size:14px; color:#475569;">{{ alertas().consultas }} consultas sin asignar</div>
              <p-tag value="Informativo" severity="secondary"></p-tag>
              <a routerLink="/consultas" style="color:#2563eb; font-size:13px; font-weight:500; cursor:pointer; margin-left:8px;">Ver consultas</a>
            </div>

          </div>
        </p-card>

        <p-card>
          <ng-template pTemplate="header">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 16px 0;">
              <h3 style="margin:0;">Casos recientes <i class="pi pi-info-circle lm-muted" style="font-size:12px;"></i></h3>
              <a routerLink="/atenciones" style="color:#2563eb; font-size:13px; font-weight:500;">Ver todos los casos</a>
            </div>
          </ng-template>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="text-align:left; color:#94a3b8; font-size:11px; text-transform:uppercase; border-bottom:1px solid #e2e8f0;">
                <th style="padding:8px 4px;">Correlativo</th>
                <th style="padding:8px 4px;">Cliente</th>
                <th style="padding:8px 4px;">Tipo</th>
                <th style="padding:8px 4px;">Estado</th>
                <th style="padding:8px 4px;">Responsable</th>
                <th style="padding:8px 4px;">Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of casosRecientes()" style="border-bottom:1px solid #f1f5f9; font-size:13px;">
                <td style="padding:10px 4px;"><a [routerLink]="['/atenciones', c.id]" style="color:#2563eb; text-decoration:none; font-weight:500;">{{ c.correlativo }}</a></td>
                <td style="padding:10px 4px; color:#475569;">{{ c.afiliadoNombre }}</td>
                <td style="padding:10px 4px; color:#475569;">{{ c.asunto || c.tipo }}</td>
                <td style="padding:10px 4px;"><p-tag [value]="estadoLabel(c.estado)" [severity]="estadoSeverity(c.estado)"></p-tag></td>
                <td style="padding:10px 4px; color:#475569;">—</td>
                <td style="padding:10px 4px; color:#475569;">{{ c.fechaApertura | date: 'dd/MM/yyyy' }}</td>
              </tr>
              <tr *ngIf="!casosRecientes().length"><td colspan="6" class="lm-muted" style="text-align:center; padding:24px;">Sin casos recientes.</td></tr>
            </tbody>
          </table>
        </p-card>
      </div>
    </ng-container>
  `,
})
export class DashboardComponent implements OnInit {
  private api = inject(DashboardApiService);
  private atencionesApi = inject(AtencionesApiService);
  protected me = inject(MeService);

  protected kpis = signal<DashboardKpis | null>(null);
  protected timeline = signal<TimelinePoint[]>([]);
  protected porCompetencia = signal<PorCompetencia[]>([]);
  protected cargaAbogados = signal<CargaAbogado[]>([]);
  protected porMes = signal<PorMes[]>([]);
  protected casosRecientes = signal<AtencionListada[]>([]);
  protected loading = signal(true);

  protected hoy = signal(new Date());

  protected primerNombre = computed(() => {
    const n = this.me.user()?.nombre ?? "";
    return n.split(/\s+/)[0] || "Usuario";
  });

  // "abiertas" ya agrupa todos los estados no terminales.
  protected casosAbiertos = (k: DashboardKpis) => k.atenciones.abiertas;

  protected totalAtenciones = computed(() => {
    const k = this.kpis();
    return k ? k.atenciones.total : 0;
  });

  protected estadosBreakdown = computed(() => {
    const k = this.kpis();
    if (!k) return [];
    const total = k.atenciones.total || 1;
    const pe = k.atenciones.porEstado ?? {};
    const suma = (...es: string[]) => es.reduce((s, e) => s + (pe[e] ?? 0), 0);
    const items = [
      { label: "Por iniciar", value: suma("Iniciada", "Asignada", "Pendiente"), color: "#2563eb" },
      { label: "En gestión", value: suma("EnGestion", "Respondida"), color: "#93c5fd" },
      { label: "En espera / comité", value: suma("EnEsperaAntecedentes", "EnEsperaArancel", "EnEsperaProvision", "EnComite"), color: "#f97316" },
      { label: "Terminadas", value: suma("Terminada", "Derivada"), color: "#22c55e" },
      { label: "Abandonadas", value: suma("Abandonada"), color: "#cbd5e1" },
    ];
    return items.filter((r) => r.value > 0).map((r) => ({ ...r, pct: (r.value / total) * 100 }));
  });

  protected porcentajePrincipal = computed(() => {
    const rows = this.estadosBreakdown();
    return rows[0] ? Math.round(rows[0].pct) : 0;
  });

  protected readonly CIRC = 2 * Math.PI * 40;

  protected donutArcs = computed(() => {
    const rows = this.estadosBreakdown();
    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    let offset = 0;
    return rows.map((r) => {
      const portion = (r.value / total) * this.CIRC;
      const arc = { color: r.color, dash: `${portion} ${this.CIRC - portion}`, offset: -offset };
      offset += portion;
      return arc;
    });
  });

  protected maxCarga = () => Math.max(...this.cargaAbogados().map((a) => a.total), 0);

  protected barWidth = (v: number) => {
    const max = Math.max(...this.cargaAbogados().map((a) => a.total), 1);
    return (v / max) * 100;
  };

  protected nombreCorto(email: string): string {
    const u = email.split("@")[0];
    return u.split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  }

  protected alertas = computed(() => {
    const k = this.kpis();
    return {
      vencer3: k?.gestiones.porVencer ?? 0,
      escritos: k?.gestiones.escritosPorVencer ?? 0,
      provisiones: k?.provisiones.pendientes ?? 0,
      consultas: k?.atenciones.consultasSinAsignar ?? 0,
    };
  });

  protected deltaConsultas = (k: DashboardKpis) => k.atenciones.consultasHoy - k.atenciones.consultasAyer;

  protected estadoLabel = etiquetaEstado;
  protected estadoSeverity = severidadEstado;

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
    this.atencionesApi.buscar({ page: 1, pageSize: 8 }).subscribe({
      next: (r) => this.casosRecientes.set(r.data),
      error: () => this.casosRecientes.set([]),
    });
  }
}
