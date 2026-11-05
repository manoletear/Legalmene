import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import type { TableLazyLoadEvent } from "primeng/table";
import { ProvisionesApiService, ProvisionRow } from "../../core/services/provisiones.service";
import { MeService } from "../../core/services/me.service";
import { PromptService } from "../../shared/prompt.service";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

@Component({
  selector: "lm-provisiones",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CardModule, SelectModule, ButtonModule, TableModule, TagModule],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Provisiones</h1>
        <small class="lm-muted">Fondos solicitados por caso. Aprueba un Supervisor o Administrador.</small>
      </div>
      <p-select
        [(ngModel)]="filtroEstado"
        (onChange)="setEstado($event.value)"
        [options]="estadoOpts"
        placeholder="Todos los estados"
        [showClear]="true"
        [style]="{ width: '200px' }"
      ></p-select>
    </div>

    <p-card>
      <p-table
        [value]="data()"
        [lazy]="true"
        (onLazyLoad)="onLazy($event)"
        [paginator]="true"
        [rows]="pageSize()"
        [totalRecords]="total()"
        [loading]="loading()"
        [first]="(page() - 1) * pageSize()"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th>Caso</th><th>Motivo</th><th style="text-align:right;">Monto</th><th>Estado</th>
            <th>Solicitada por</th><th>Fecha</th><th></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-p>
          <tr>
            <td><a [routerLink]="['/atenciones', p.atencionId]" class="lm-mono">{{ p.correlativo }}</a><div class="lm-small lm-muted">{{ p.asunto }}</div></td>
            <td>{{ p.motivo }}<div *ngIf="p.observacionResolucion" class="lm-small lm-muted">{{ p.observacionResolucion }}</div></td>
            <td style="text-align:right;">$ {{ p.monto | number }}</td>
            <td><p-tag [value]="p.estado" [severity]="severidad(p.estado)"></p-tag></td>
            <td class="lm-small">{{ p.solicitadaPorEmail }}</td>
            <td class="lm-small">{{ p.fechaSolicitud | date: 'dd/MM/yyyy' }}</td>
            <td style="text-align:right; white-space:nowrap;">
              <ng-container *ngIf="p.estado === 'Solicitada' && puedeAprobar()">
                <button pButton type="button" class="p-button-sm p-button-success p-button-text" label="Aprobar" (click)="resolver(p, true)"></button>
                <button pButton type="button" class="p-button-sm p-button-danger p-button-text" label="Rechazar" (click)="resolver(p, false)"></button>
              </ng-container>
              <button *ngIf="p.estado === 'Aprobada'" pButton type="button" class="p-button-sm p-button-text" label="Registrar gasto" (click)="registrarGasto(p)"></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" style="text-align:center; padding:24px;" class="lm-muted">Sin provisiones.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class ProvisionesComponent implements OnInit {
  private api = inject(ProvisionesApiService);
  private me = inject(MeService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);

  protected data = signal<ProvisionRow[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected filtroEstado: string | undefined = "Solicitada";
  protected estadoOpts = ["Solicitada", "Aprobada", "Rechazada"];
  protected puedeAprobar = computed(() => ["Administrador", "Supervisor"].includes(this.me.user()?.rol ?? ""));

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api.listar({ page: this.page(), pageSize: this.pageSize(), estado: this.filtroEstado }).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setEstado(e: string | undefined) {
    this.filtroEstado = e;
    this.page.set(1);
    this.recargar();
  }

  onLazy(ev: TableLazyLoadEvent) {
    const rows = ev.rows ?? this.pageSize();
    this.page.set(Math.floor((ev.first ?? 0) / rows) + 1);
    this.pageSize.set(rows);
    this.recargar();
  }

  async resolver(p: ProvisionRow, aprobar: boolean) {
    const observacion = await this.prompt.open({
      header: `${aprobar ? "Aprobar" : "Rechazar"} provisión de $ ${p.monto.toLocaleString("es-CL")}`,
      label: aprobar ? "Observación (opcional)" : "Motivo del rechazo",
      multiline: true,
      required: !aprobar,
    });
    if (observacion === null) return;
    const obs = observacion.trim() || undefined;
    const req = aprobar ? this.api.aprobar(p.id, obs) : this.api.rechazar(p.id, obs);
    req.subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: aprobar ? "Provisión aprobada" : "Provisión rechazada", life: 2500 });
        this.recargar();
      },
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }

  async registrarGasto(p: ProvisionRow) {
    const montoTxt = await this.prompt.open({ header: `Gasto contra ${p.correlativo}`, label: "Monto en pesos", required: true });
    if (!montoTxt) return;
    const monto = Number(montoTxt.replace(/[.\s$]/g, ""));
    if (!Number.isInteger(monto) || monto <= 0) {
      this.msg.add({ severity: "warn", summary: "Monto inválido", life: 3000 });
      return;
    }
    const glosa = await this.prompt.open({ header: "Detalle del gasto", label: "Glosa", required: true });
    if (!glosa) return;
    this.api.registrarMovimiento(p.id, { tipo: "Gasto", monto, glosa }).subscribe({
      next: () => this.msg.add({ severity: "success", summary: "Gasto registrado", life: 2500 }),
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }

  severidad(e: string): Severity {
    if (e === "Aprobada") return "success";
    if (e === "Rechazada") return "danger";
    return "warn";
  }
}
