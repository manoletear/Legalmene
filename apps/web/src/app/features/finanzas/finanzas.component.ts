import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { MessageService } from "primeng/api";
import { forkJoin } from "rxjs";
import {
  ESTADO_ARANCEL_COLOR,
  ESTADO_ARANCEL_LABEL,
  ESTADO_PROVISION_LABEL,
  type ArancelAtencionRow,
  type EstadoProvision,
} from "@legalmene/shared";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { ProvisionesApiService } from "../../core/services/provisiones.service";
import { MeService } from "../../core/services/me.service";
import { PromptService } from "../../shared/prompt.service";

// Estados de provisión que requieren acción de Contador o Finanzas.
const ESTADOS_FINANZAS: EstadoProvision[] = ["Solicitada", "Autorizada", "Disponible", "Rendida"];

// Bandeja de Contador/Finanzas: copagos aprobados por cobrar y provisiones por gestionar.
@Component({
  selector: "lm-finanzas",
  standalone: true,
  imports: [CommonModule, RouterLink, CardModule, ButtonModule, TableModule],
  template: `
    <div style="margin-bottom:16px;">
      <h1 style="margin:0 0 4px 0;">Finanzas</h1>
      <small class="lm-muted">Aranceles aprobados pendientes de pago y provisiones de fondos que esperan a Contador o Finanzas.</small>
    </div>

    <div class="lm-grid lm-grid-4" style="margin-bottom:16px;">
      <a *ngFor="let e of estadosFinanzas" class="lm-info-card" [routerLink]="['/provisiones']" [queryParams]="{ estado: e }" style="text-decoration:none;">
        <div class="lm-info-card-header"><i class="pi pi-wallet"></i> {{ etiquetaProvision(e) }}</div>
        <div class="lm-info-main">{{ conteos()[e] ?? 0 }}</div>
        <div class="lm-small lm-muted">$ {{ (montos()[e] ?? 0) | number }}</div>
      </a>
    </div>

    <p-card header="Aranceles aprobados pendientes de pago">
      <p-table [value]="aranceles()" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Caso</th><th>Plan</th><th>Estado</th><th style="text-align:right;">Copago</th><th></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr>
            <td><a [routerLink]="['/atenciones', a.atencionId]" class="lm-mono">{{ a.correlativo }}</a><div class="lm-small lm-muted">{{ a.asunto }}</div></td>
            <td>{{ a.codPlan }}</td>
            <td>
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px;" [style.background]="color(a.estado)"></span>
              {{ etiqueta(a.estado) }}
            </td>
            <td style="text-align:right;">{{ (a.copagoUfCentesimas ?? 0) / 100 | number: '1.0-2' }} UF</td>
            <td style="text-align:right;">
              <button *ngIf="puedeCobrar()" pButton size="small" [outlined]="true" label="Registrar pago" (click)="registrarPago(a)"></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" style="text-align:center; padding:24px;" class="lm-muted">Sin aranceles pendientes de pago.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class FinanzasComponent implements OnInit {
  private atencionesApi = inject(AtencionesApiService);
  private provisionesApi = inject(ProvisionesApiService);
  private me = inject(MeService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);

  protected estadosFinanzas = ESTADOS_FINANZAS;
  protected aranceles = signal<ArancelAtencionRow[]>([]);
  protected conteos = signal<Partial<Record<EstadoProvision, number>>>({});
  protected montos = signal<Partial<Record<EstadoProvision, number>>>({});
  protected loading = signal(false);
  protected puedeCobrar = computed(() => ["Administrador", "Contador"].includes(this.me.user()?.rol ?? ""));

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.atencionesApi.arancelesPorEstado("Aprobado").subscribe({
      next: (r) => {
        this.aranceles.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    forkJoin(ESTADOS_FINANZAS.map((estado) => this.provisionesApi.listar({ estado, pageSize: 200 }))).subscribe((res) => {
      const c: Partial<Record<EstadoProvision, number>> = {};
      const m: Partial<Record<EstadoProvision, number>> = {};
      res.forEach((r, i) => {
        c[ESTADOS_FINANZAS[i]] = r.total;
        m[ESTADOS_FINANZAS[i]] = r.data.reduce((s, p) => s + p.monto, 0);
      });
      this.conteos.set(c);
      this.montos.set(m);
    });
  }

  protected etiqueta(e: ArancelAtencionRow["estado"]): string {
    return ESTADO_ARANCEL_LABEL[e];
  }

  protected color(e: ArancelAtencionRow["estado"]): string {
    return ESTADO_ARANCEL_COLOR[e];
  }

  protected etiquetaProvision(e: EstadoProvision): string {
    return ESTADO_PROVISION_LABEL[e];
  }

  async registrarPago(a: ArancelAtencionRow) {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const fecha = await this.prompt.open({ header: `Pago de arancel ${a.correlativo}`, label: "Fecha de pago (AAAA-MM-DD)", initialValue: hoy, required: true });
    if (!fecha) return;
    const medio = await this.prompt.open({ header: "Medio de pago", label: "WebPay, CasaCentral o Transferencia", initialValue: "CasaCentral", required: true });
    if (!medio || !["WebPay", "CasaCentral", "Transferencia"].includes(medio.trim())) {
      if (medio) this.msg.add({ severity: "warn", summary: "Medio inválido", life: 3000 });
      return;
    }
    this.atencionesApi.pagarArancel(a.atencionId, { fechaPago: fecha.trim(), medio: medio.trim() as "CasaCentral" }).subscribe({
      next: (r) => {
        this.msg.add({ severity: "success", summary: "Pago registrado", detail: `$ ${(r.montoClp ?? 0).toLocaleString("es-CL")}`, life: 3000 });
        this.recargar();
      },
      error: (err) => this.msg.add({ severity: "error", summary: "No se pudo registrar", detail: err.error?.message ?? err.message, life: 6000 }),
    });
  }
}
