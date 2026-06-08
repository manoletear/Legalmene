import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { DatePickerModule } from "primeng/datepicker";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import type { Atencion } from "@legalmene/shared";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

@Component({
  selector: "lm-reportes",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    TableModule,
    TagModule,
  ],
  template: `
    <h1 style="margin: 0 0 4px 0;">Búsqueda y Reportes</h1>
    <p class="lm-muted" style="margin: 0 0 20px 0;">Consulte y genere reportes de casos, consultas y operaciones.</p>

    <div style="display:grid; grid-template-columns: 1fr 320px; gap: 16px;">
      <div>
        <!-- Filtros -->
        <p-card>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px;">
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">RUT</label>
              <input pInputText type="text" [(ngModel)]="filtros.rut" placeholder="Ej: 12.345.678-9" />
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Cliente</label>
              <input pInputText type="text" [(ngModel)]="filtros.cliente" placeholder="Seleccione cliente..." />
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Plan</label>
              <p-select [(ngModel)]="filtros.plan" [options]="planOpts" optionLabel="label" optionValue="value" placeholder="Seleccione plan..." [showClear]="true"></p-select>
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Canal</label>
              <p-select [(ngModel)]="filtros.canal" [options]="canalOpts" optionLabel="label" optionValue="value" placeholder="Seleccione canal..." [showClear]="true"></p-select>
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Tipo de atención</label>
              <p-select [(ngModel)]="filtros.tipo" [options]="tipoOpts" optionLabel="label" optionValue="value" placeholder="Seleccione tipo..." [showClear]="true"></p-select>
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Materia</label>
              <p-select [(ngModel)]="filtros.materia" [options]="materiaOpts" optionLabel="label" optionValue="value" placeholder="Seleccione materia..." [showClear]="true"></p-select>
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Responsable</label>
              <input pInputText type="text" [(ngModel)]="filtros.responsable" placeholder="Seleccione responsable..." />
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Estado</label>
              <p-select [(ngModel)]="filtros.estado" [options]="estadoOpts" optionLabel="label" optionValue="value" placeholder="Seleccione estado..." [showClear]="true"></p-select>
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Fecha desde</label>
              <p-datepicker [(ngModel)]="filtros.fechaDesde" dateFormat="dd/mm/yy" [showIcon]="true" iconDisplay="input"></p-datepicker>
            </div>
            <div class="lm-col" style="gap:6px;">
              <label class="lm-small">Fecha hasta</label>
              <p-datepicker [(ngModel)]="filtros.fechaHasta" dateFormat="dd/mm/yy" [showIcon]="true" iconDisplay="input"></p-datepicker>
            </div>
            <div style="grid-column: span 2; display:flex; gap:8px; align-items:flex-end; justify-content:flex-end;">
              <button pButton icon="pi pi-search" label="Buscar" (click)="buscar()"></button>
              <button pButton icon="pi pi-refresh" label="Limpiar" [outlined]="true" severity="secondary" (click)="limpiar()"></button>
              <button pButton icon="pi pi-file-excel" label="Exportar Excel" [outlined]="true" severity="success"></button>
            </div>
          </div>
        </p-card>

        <!-- KPIs -->
        <div class="lm-grid lm-grid-4" style="margin-top:16px;">
          <p-card styleClass="lm-kpi-card">
            <div style="display:flex; align-items:center; gap:14px;">
              <div class="lm-kpi-icon blue"><i class="pi pi-file"></i></div>
              <div>
                <div class="lm-kpi-label">Total resultados</div>
                <div class="lm-kpi-value lm-mono">{{ resultados().total | number }}</div>
                <small class="lm-muted">registros encontrados</small>
              </div>
            </div>
          </p-card>
          <p-card styleClass="lm-kpi-card">
            <div style="display:flex; align-items:center; gap:14px;">
              <div class="lm-kpi-icon green"><i class="pi pi-dollar"></i></div>
              <div>
                <div class="lm-kpi-label">Casos activos</div>
                <div class="lm-kpi-value lm-mono">{{ resultados().activos | number }}</div>
                <small class="lm-muted">{{ pctActivos() }}% del total</small>
              </div>
            </div>
          </p-card>
          <p-card styleClass="lm-kpi-card">
            <div style="display:flex; align-items:center; gap:14px;">
              <div class="lm-kpi-icon orange"><i class="pi pi-comment"></i></div>
              <div>
                <div class="lm-kpi-label">Consultas</div>
                <div class="lm-kpi-value lm-mono">{{ resultados().consultas | number }}</div>
                <small class="lm-muted">{{ pctConsultas() }}% del total</small>
              </div>
            </div>
          </p-card>
          <p-card styleClass="lm-kpi-card">
            <div style="display:flex; align-items:center; gap:14px;">
              <div class="lm-kpi-icon purple"><i class="pi pi-file-export"></i></div>
              <div>
                <div class="lm-kpi-label">Exportables</div>
                <div class="lm-kpi-value lm-mono">{{ resultados().total | number }}</div>
                <small class="lm-muted">disponibles</small>
              </div>
            </div>
          </p-card>
        </div>

        <!-- Resultados -->
        <p-card styleClass="lm-mt-16" [style]="{ 'margin-top': '16px' }">
          <ng-template pTemplate="header">
            <div style="padding:16px 16px 0;">
              <h3 style="margin:0;">Resultados de búsqueda</h3>
            </div>
          </ng-template>
          <p-table
            [value]="data()"
            [paginator]="true"
            [rows]="10"
            [rowsPerPageOptions]="[10, 25, 50]"
            [totalRecords]="resultados().total"
            styleClass="p-datatable-sm"
          >
            <ng-template pTemplate="header">
              <tr>
                <th>Correlativo</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Responsable</th>
                <th>Plan</th>
                <th>Fecha</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-r>
              <tr>
                <td>{{ r.correlativo }}</td>
                <td>{{ r.cliente || '—' }}</td>
                <td>{{ r.materia || r.tipo }}</td>
                <td><p-tag [value]="estadoLabel(r.estado)" [severity]="estadoSeverity(r.estado)"></p-tag></td>
                <td>{{ r.responsable || '—' }}</td>
                <td>{{ r.plan || codPlanActual }}</td>
                <td>{{ r.fechaApertura | date: 'dd/MM/yyyy' }}</td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr><td colspan="7" style="text-align:center; padding:32px;" class="lm-muted">Sin resultados.</td></tr>
            </ng-template>
          </p-table>
        </p-card>
      </div>

      <!-- Side panel: Reportes disponibles -->
      <div class="lm-col" style="gap:16px;">
        <p-card>
          <ng-template pTemplate="header">
            <div style="padding:16px 16px 0;">
              <h3 style="margin:0;">Reportes disponibles</h3>
            </div>
          </ng-template>
          <div class="lm-col" style="gap:12px;">
            <div *ngFor="let r of reportesDisponibles" class="lm-row" style="padding:8px; border-radius:8px; cursor:pointer;" [style.background]="'#f8fafc'">
              <div class="lm-kpi-icon" [class]="r.color" style="width:36px; height:36px; border-radius:8px;">
                <i class="pi {{ r.icono }}" style="font-size:16px;"></i>
              </div>
              <div style="flex:1;">
                <div style="font-weight:600; color:#0f172a; font-size:14px;">{{ r.titulo }}</div>
                <small class="lm-muted">{{ r.subtitulo }}</small>
              </div>
              <button pButton icon="pi pi-download" [text]="true" severity="secondary"></button>
            </div>
            <button pButton label="Ver todos los reportes" [outlined]="true" icon="pi pi-arrow-right" iconPos="right"></button>
          </div>
        </p-card>

        <p-card>
          <div class="lm-row">
            <i class="pi pi-calendar" style="color:#2563eb;"></i>
            <strong>Última actualización</strong>
          </div>
          <p class="lm-muted lm-small">23 de mayo de 2024, 10:30 a.m.</p>
        </p-card>

        <p-card [style]="{ background: '#fef9c3', border: '1px solid #fde047' }">
          <div class="lm-row">
            <i class="pi pi-lightbulb" style="color:#ca8a04;"></i>
            <strong>Consejo</strong>
          </div>
          <p class="lm-small" style="margin:8px 0 0;">
            Utiliza los filtros para obtener resultados más precisos y exporta tus reportes para un análisis detallado.
          </p>
        </p-card>
      </div>
    </div>
  `,
})
export class ReportesComponent implements OnInit {
  private api = inject(AtencionesApiService);
  private route = inject(ActivatedRoute);

  protected codPlanActual = "DEMO";
  protected data = signal<Atencion[]>([]);
  protected resultados = signal({ total: 0, activos: 0, consultas: 0 });

  protected filtros: {
    rut: string;
    cliente: string;
    plan: string | undefined;
    canal: string | undefined;
    tipo: string | undefined;
    materia: string | undefined;
    responsable: string;
    estado: string | undefined;
    fechaDesde: Date | undefined;
    fechaHasta: Date | undefined;
    q: string;
  } = {
    rut: "",
    cliente: "",
    plan: undefined,
    canal: undefined,
    tipo: undefined,
    materia: undefined,
    responsable: "",
    estado: undefined,
    fechaDesde: undefined,
    fechaHasta: undefined,
    q: "",
  };

  protected tipoOpts = [
    { label: "Consulta", value: "Consulta" },
    { label: "Asesoría", value: "Asesoria" },
    { label: "Juicio", value: "Juicio" },
  ];
  protected estadoOpts = [
    { label: "Abierta", value: "Abierta" },
    { label: "En gestión", value: "EnGestion" },
    { label: "En comité", value: "EnComite" },
    { label: "Cerrada", value: "Cerrada" },
  ];
  protected planOpts = [
    { label: "Corporativo Premium", value: "CORP-PREM" },
    { label: "Corporativo Plus", value: "CORP-PLUS" },
    { label: "Básico", value: "BASIC" },
  ];
  protected canalOpts = [
    { label: "Web", value: "Web" },
    { label: "Teléfono", value: "Telefono" },
    { label: "Presencial", value: "Presencial" },
  ];
  protected materiaOpts = [
    { label: "Cobranza", value: "Cobranza" },
    { label: "Laboral", value: "Laboral" },
    { label: "Civil", value: "Civil" },
    { label: "Penal", value: "Penal" },
    { label: "Familia", value: "Familia" },
  ];

  protected reportesDisponibles = [
    { titulo: "Reporte por plan", subtitulo: "Resumen por plan contratado", icono: "pi-file", color: "blue" },
    { titulo: "Reporte por canal", subtitulo: "Distribución por canal de ingreso", icono: "pi-chart-bar", color: "orange" },
    { titulo: "Tasa de uso", subtitulo: "Uso de servicios por plan y período", icono: "pi-clock", color: "blue" },
    { titulo: "Aranceles", subtitulo: "Resumen de aranceles aplicados", icono: "pi-dollar", color: "green" },
    { titulo: "Provisiones", subtitulo: "Provisiones por estado y cliente", icono: "pi-wallet", color: "purple" },
  ];

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap.get("q");
    if (q) this.filtros.q = q;
    this.buscar();
  }

  buscar() {
    this.api
      .buscar({
        page: 1,
        pageSize: 50,
        tipo: this.filtros.tipo as "Consulta" | undefined,
        estado: this.filtros.estado,
        q: this.filtros.q || undefined,
      })
      .subscribe((res) => {
        this.data.set(res.data);
        const activos = res.data.filter((a) => a.estado !== "Cerrada" && a.estado !== "Archivada").length;
        const consultas = res.data.filter((a) => a.tipo === "Consulta").length;
        this.resultados.set({ total: res.total, activos, consultas });
      });
  }

  limpiar() {
    this.filtros = {
      rut: "", cliente: "", plan: undefined, canal: undefined,
      tipo: undefined, materia: undefined, responsable: "",
      estado: undefined, fechaDesde: undefined, fechaHasta: undefined, q: "",
    };
    this.buscar();
  }

  pctActivos(): number {
    const t = this.resultados().total;
    return t > 0 ? Math.round((this.resultados().activos / t) * 100) : 0;
  }

  pctConsultas(): number {
    const t = this.resultados().total;
    return t > 0 ? Math.round((this.resultados().consultas / t) * 100) : 0;
  }

  estadoLabel(e: string): string {
    const map: Record<string, string> = {
      Abierta: "En curso", EnGestion: "En revisión", EnComite: "Pendiente cliente",
      Cerrada: "Finalizado", Archivada: "Cerrado", Suspendida: "Suspendida",
    };
    return map[e] || e;
  }

  estadoSeverity(e: string): Severity {
    if (e === "Cerrada") return "success";
    if (e === "Archivada") return "secondary";
    if (e === "EnGestion") return "info";
    if (e === "EnComite") return "warn";
    if (e === "Suspendida") return "danger";
    return "success";
  }
}
