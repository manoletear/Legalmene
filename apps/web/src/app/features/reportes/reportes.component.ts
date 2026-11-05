import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { MultiSelectModule } from "primeng/multiselect";
import { TableModule } from "primeng/table";
import { TabsModule } from "primeng/tabs";
import { MessageService } from "primeng/api";
import {
  CAMPOS_INFORME_ATENCIONES,
  type CampoInformeAtencion,
  type FilaController,
  type FilaReporteCanal,
  type FilaReportePlan,
  type SerieAfiliadosMes,
  type TipoAtencion,
} from "@legalmene/shared";
import { ReportesApiService, type ParamsReporte } from "../../core/services/reportes.service";
import { PlanesApiService } from "../../core/services/planes.service";
import { MeService } from "../../core/services/me.service";
import { descargarArchivo } from "../../shared/descarga";

type Vista = "plan" | "canal" | "afiliados" | "informe" | "controller";

interface Opcion {
  label: string;
  value: string;
}

function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

// Reportes del Anexo §XI C (por plan, por canal, afiliados activos, informe con selección de campos)
// y controller de usuarios. Nada se calcula hasta que el usuario presiona "Generar".
@Component({
  selector: "lm-reportes",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, SelectModule, MultiSelectModule, TableModule, TabsModule],
  template: `
    <h1 style="margin: 0 0 4px 0;">Reportes</h1>
    <p class="lm-muted" style="margin: 0 0 16px 0;">Elija el período y presione Generar. Todos los reportes se pueden descargar en Excel.</p>

    <p-card>
      <div class="lm-reporte-filtros">
        <div class="lm-col" style="gap:4px;">
          <label class="lm-small">Desde</label>
          <input pInputText type="date" name="desde" [(ngModel)]="desde" />
        </div>
        <div class="lm-col" style="gap:4px;">
          <label class="lm-small">Hasta</label>
          <input pInputText type="date" name="hasta" [(ngModel)]="hasta" />
        </div>
        <div class="lm-col" style="gap:4px;" *ngIf="vista() !== 'canal'">
          <label class="lm-small">Plan</label>
          <p-select [(ngModel)]="codPlan" [options]="planOpts()" optionLabel="label" optionValue="value" placeholder="Todos" [showClear]="true" [filter]="true" appendTo="body"></p-select>
        </div>
        <div class="lm-col" style="gap:4px;" *ngIf="vista() !== 'plan'">
          <label class="lm-small">Canal</label>
          <p-select [(ngModel)]="canalId" [options]="canalOpts()" optionLabel="label" optionValue="value" placeholder="Todos" [showClear]="true" appendTo="body"></p-select>
        </div>
      </div>

      <p-tabs [value]="vista()" (valueChange)="cambiarVista($event)" style="margin-top:16px; display:block;">
        <p-tablist>
          <p-tab value="plan">Por plan</p-tab>
          <p-tab value="canal">Por canal</p-tab>
          <p-tab value="afiliados">Afiliados activos</p-tab>
          <p-tab value="informe">Informe de atenciones</p-tab>
          <p-tab *ngIf="puedeController()" value="controller">Controller de usuarios</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="plan">
            <ng-container *ngTemplateOutlet="acciones; context: { v: 'plan' }"></ng-container>
            <p-table *ngIf="planes() as filas; else vacio" [value]="filas" styleClass="p-datatable-sm">
              <ng-template pTemplate="header">
                <tr><th>Plan</th><th>Canal</th><th class="lm-num">Afiliados vigentes</th><th class="lm-num">Consultas</th><th class="lm-num">Asesorías</th><th class="lm-num">Juicios</th><th class="lm-num">Posesiones</th><th class="lm-num">Total</th><th class="lm-num">Tasa de uso</th></tr>
              </ng-template>
              <ng-template pTemplate="body" let-f>
                <tr>
                  <td><strong>{{ f.codPlan }}</strong> <span class="lm-muted lm-small">{{ f.nombre }}</span></td>
                  <td>{{ f.canal ?? '—' }}</td>
                  <td class="lm-num">{{ f.afiliadosVigentes | number }}</td>
                  <td class="lm-num">{{ f.consultas | number }}</td>
                  <td class="lm-num">{{ f.asesorias | number }}</td>
                  <td class="lm-num">{{ f.juicios | number }}</td>
                  <td class="lm-num">{{ f.posesiones | number }}</td>
                  <td class="lm-num">{{ f.total | number }}</td>
                  <td class="lm-num">{{ tasa(f.tasaUso) }}</td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="9" class="lm-muted" style="text-align:center; padding:24px;">Sin datos en el período.</td></tr></ng-template>
            </p-table>
            <p class="lm-small lm-muted" *ngIf="planes()">{{ notaTasa }}</p>
          </p-tabpanel>

          <p-tabpanel value="canal">
            <ng-container *ngTemplateOutlet="acciones; context: { v: 'canal' }"></ng-container>
            <p-table *ngIf="canales() as filas; else vacio" [value]="filas" styleClass="p-datatable-sm">
              <ng-template pTemplate="header">
                <tr><th>Canal</th><th>Planes</th><th class="lm-num">Afiliados vigentes</th><th class="lm-num">Consultas</th><th class="lm-num">Asesorías</th><th class="lm-num">Juicios</th><th class="lm-num">Posesiones</th><th class="lm-num">Total</th><th class="lm-num">Tasa de uso</th></tr>
              </ng-template>
              <ng-template pTemplate="body" let-f>
                <tr>
                  <td><strong>{{ f.canal }}</strong></td>
                  <td class="lm-small">{{ codigos(f) }}</td>
                  <td class="lm-num">{{ f.afiliadosVigentes | number }}</td>
                  <td class="lm-num">{{ f.consultas | number }}</td>
                  <td class="lm-num">{{ f.asesorias | number }}</td>
                  <td class="lm-num">{{ f.juicios | number }}</td>
                  <td class="lm-num">{{ f.posesiones | number }}</td>
                  <td class="lm-num">{{ f.total | number }}</td>
                  <td class="lm-num">{{ tasa(f.tasaUso) }}</td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="9" class="lm-muted" style="text-align:center; padding:24px;">Sin datos en el período.</td></tr></ng-template>
            </p-table>
            <p class="lm-small lm-muted" *ngIf="canales()">{{ notaTasa }}</p>
          </p-tabpanel>

          <p-tabpanel value="afiliados">
            <ng-container *ngTemplateOutlet="acciones; context: { v: 'afiliados' }"></ng-container>
            <p-table *ngIf="afiliadosMes() as filas; else vacio" [value]="filas" styleClass="p-datatable-sm" [paginator]="filas.length > 50" [rows]="50">
              <ng-template pTemplate="header">
                <tr><th>Mes</th><th>Plan</th><th>Canal</th><th class="lm-num">Afiliados activos</th></tr>
              </ng-template>
              <ng-template pTemplate="body" let-f>
                <tr><td>{{ f.mes }}</td><td>{{ f.codPlan }} <span class="lm-muted lm-small">{{ f.plan }}</span></td><td>{{ f.canal ?? '—' }}</td><td class="lm-num">{{ f.activos | number }}</td></tr>
              </ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="lm-muted" style="text-align:center; padding:24px;">Sin afiliados activos en el período.</td></tr></ng-template>
            </p-table>
          </p-tabpanel>

          <p-tabpanel value="informe">
            <div class="lm-reporte-filtros" style="margin-bottom:12px;">
              <div class="lm-col" style="gap:4px;">
                <label class="lm-small">Tipos de atención (una hoja por tipo)</label>
                <p-multiselect [(ngModel)]="tipos" [options]="tipoOpts" optionLabel="label" optionValue="value" placeholder="Elija tipos" appendTo="body" display="chip"></p-multiselect>
              </div>
              <div class="lm-col" style="gap:4px; grid-column: span 2;">
                <label class="lm-small">Campos</label>
                <p-multiselect [(ngModel)]="campos" [options]="campoOpts" optionLabel="label" optionValue="value" placeholder="Elija campos" appendTo="body" display="chip"></p-multiselect>
              </div>
            </div>
            <div class="lm-reporte-acciones">
              <button pButton icon="pi pi-file-excel" label="Descargar informe" [disabled]="descargando()" (click)="descargarInforme()"></button>
            </div>
            <p class="lm-small lm-muted">El libro incluye una hoja "Resumen" con el conteo por plan y tipo, y una hoja por cada tipo elegido.</p>
          </p-tabpanel>

          <p-tabpanel *ngIf="puedeController()" value="controller">
            <ng-container *ngTemplateOutlet="acciones; context: { v: 'controller' }"></ng-container>
            <p-table *ngIf="controller() as filas; else vacio" [value]="filas" styleClass="p-datatable-sm">
              <ng-template pTemplate="header">
                <tr><th>Usuario</th><th>Perfil</th><th class="lm-num">Asignadas</th><th class="lm-num">Pendientes</th><th class="lm-num">Terminadas</th><th class="lm-num">Gestiones pendientes</th><th class="lm-num">Gestiones vencidas</th><th class="lm-num">Comités abiertos</th></tr>
              </ng-template>
              <ng-template pTemplate="body" let-f>
                <tr>
                  <td><strong>{{ f.nombre }}</strong><div class="lm-small lm-muted">{{ f.email }}</div></td>
                  <td>{{ f.perfil }}</td>
                  <td class="lm-num">{{ f.asignadas | number }}</td>
                  <td class="lm-num">{{ f.pendientes | number }}</td>
                  <td class="lm-num">{{ f.terminadas | number }}</td>
                  <td class="lm-num">{{ f.gestionesPendientes | number }}</td>
                  <td class="lm-num" [class.lm-alerta]="f.gestionesVencidas > 0">{{ f.gestionesVencidas | number }}</td>
                  <td class="lm-num">{{ f.comitesAbiertos | number }}</td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage"><tr><td colspan="8" class="lm-muted" style="text-align:center; padding:24px;">Sin usuarios con atenciones en el período.</td></tr></ng-template>
            </p-table>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </p-card>

    <ng-template #acciones let-v="v">
      <div class="lm-reporte-acciones">
        <button pButton icon="pi pi-play" label="Generar" [loading]="cargando()" (click)="generar(v)"></button>
        <button pButton icon="pi pi-file-excel" label="Descargar Excel" [outlined]="true" [disabled]="descargando()" (click)="descargar(v)"></button>
      </div>
    </ng-template>

    <ng-template #vacio>
      <div class="lm-vacio-busqueda">
        <i class="pi pi-chart-bar"></i>
        <p>Elija el período y presione Generar</p>
      </div>
    </ng-template>
  `,
  styles: [
    `
      .lm-reporte-filtros { display:grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap:12px; align-items:end; }
      .lm-reporte-acciones { display:flex; gap:8px; justify-content:flex-end; margin-bottom:12px; flex-wrap:wrap; }
      .lm-num { text-align:right; }
      .lm-alerta { color:#dc2626; font-weight:600; }
    `,
  ],
})
export class ReportesComponent implements OnInit {
  private api = inject(ReportesApiService);
  private planesApi = inject(PlanesApiService);
  private me = inject(MeService);
  private route = inject(ActivatedRoute);
  private msg = inject(MessageService);

  protected readonly notaTasa = "Tasa de uso = atenciones del período ÷ afiliados vigentes del período (fórmula a validar con LegalChile).";

  protected vista = signal<Vista>("plan");
  protected cargando = signal(false);
  protected descargando = signal(false);
  protected planes = signal<FilaReportePlan[] | null>(null);
  protected canales = signal<FilaReporteCanal[] | null>(null);
  protected afiliadosMes = signal<SerieAfiliadosMes[] | null>(null);
  protected controller = signal<FilaController[] | null>(null);
  protected planOpts = signal<Opcion[]>([]);
  protected canalOpts = signal<Opcion[]>([]);
  protected puedeController = computed(() => this.me.tiene("controller.ver"));

  protected desde = `${hoyChile().slice(0, 7)}-01`;
  protected hasta = hoyChile();
  protected codPlan: string | undefined;
  protected canalId: string | undefined;
  protected tipos: TipoAtencion[] = ["Consulta", "Asesoria", "Juicio"];
  protected campos: CampoInformeAtencion[] = ["correlativo", "tipo", "estado", "rut", "afiliado", "plan", "materia", "fechaApertura"];

  protected tipoOpts: { label: string; value: TipoAtencion }[] = [
    { label: "Consultas", value: "Consulta" },
    { label: "Asesorías", value: "Asesoria" },
    { label: "Juicios", value: "Juicio" },
  ];
  protected campoOpts = (Object.entries(CAMPOS_INFORME_ATENCIONES) as [CampoInformeAtencion, string][]).map(([value, label]) => ({ label, value }));

  ngOnInit() {
    const v = this.route.snapshot.queryParamMap.get("vista") as Vista | null;
    if (v && ["plan", "canal", "afiliados", "informe", "controller"].includes(v)) this.vista.set(v);
    this.planesApi.listar().subscribe((ps) => this.planOpts.set(ps.map((p) => ({ label: `${p.codPlan} — ${p.nombre}`, value: p.codPlan }))));
    this.planesApi.canales().subscribe((cs) => this.canalOpts.set(cs.map((c) => ({ label: c.nombre, value: c.id }))));
  }

  cambiarVista(v: string | number | undefined) {
    this.vista.set((v as Vista) ?? "plan");
  }

  protected tasa(t: number | null): string {
    return t === null ? "sin afiliados" : t.toLocaleString("es-CL", { maximumFractionDigits: 4 });
  }

  protected codigos(f: FilaReporteCanal): string {
    return f.planes.map((p) => p.codPlan).join(", ") || "—";
  }

  private periodoValido(): boolean {
    if (!this.desde || !this.hasta) {
      this.msg.add({ severity: "warn", summary: "Falta el período", detail: "Ingrese fecha desde y hasta", life: 3000 });
      return false;
    }
    if (this.desde > this.hasta) {
      this.msg.add({ severity: "warn", summary: "Fechas inválidas", detail: "La fecha desde debe ser anterior a la fecha hasta", life: 3000 });
      return false;
    }
    return true;
  }

  private params(v: Vista): ParamsReporte {
    const base: ParamsReporte = { desde: this.desde, hasta: this.hasta };
    if (v !== "canal") base["codPlan"] = this.codPlan;
    if (v !== "plan") base["canalId"] = this.canalId;
    return base;
  }

  generar(v: Vista) {
    if (!this.periodoValido()) return;
    const p = this.params(v);
    this.cargando.set(true);
    const fin = { complete: () => this.cargando.set(false), error: (err: { error?: { message?: string }; message: string }) => this.fallo(err) };
    if (v === "plan") this.api.porPlan(p).subscribe({ next: (r) => this.planes.set(r), ...fin });
    else if (v === "canal") this.api.porCanal(p).subscribe({ next: (r) => this.canales.set(r), ...fin });
    else if (v === "afiliados") this.api.afiliadosMes(p).subscribe({ next: (r) => this.afiliadosMes.set(r), ...fin });
    else if (v === "controller") this.api.controller(p).subscribe({ next: (r) => this.controller.set(r), ...fin });
  }

  private fallo(err: { error?: { message?: string }; message: string }) {
    this.cargando.set(false);
    this.msg.add({ severity: "error", summary: "No se pudo generar", detail: err.error?.message ?? err.message, life: 5000 });
  }

  async descargar(v: Vista) {
    if (!this.periodoValido()) return;
    const ruta = { plan: "plan", canal: "canal", afiliados: "afiliados-mes", controller: "controller", informe: "" }[v];
    await this.bajar(`/reportes/${ruta}.xlsx`, `reporte-${ruta}`, { params: this.params(v) });
  }

  async descargarInforme() {
    if (!this.periodoValido()) return;
    if (!this.tipos.length || !this.campos.length) {
      this.msg.add({ severity: "warn", summary: "Faltan datos", detail: "Elija al menos un tipo y un campo", life: 3000 });
      return;
    }
    const body = { desde: this.desde, hasta: this.hasta, tipos: this.tipos, campos: this.campos, codPlan: this.codPlan, canalId: this.canalId };
    await this.bajar("/reportes/informe.xlsx", "informe-atenciones", { body });
  }

  private async bajar(ruta: string, nombre: string, opciones: Parameters<typeof descargarArchivo>[2]) {
    this.descargando.set(true);
    try {
      await descargarArchivo(ruta, `${nombre}-${this.desde}_${this.hasta}.xlsx`, opciones);
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo descargar", detail: (e as Error).message, life: 6000 });
    } finally {
      this.descargando.set(false);
    }
  }
}
