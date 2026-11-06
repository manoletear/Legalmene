import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { CriteriosBusquedaComponent, type Criterios } from "../../shared/criterios-busqueda.component";
import { descargarArchivo } from "../../shared/descarga";
import { PagosApiService } from "../../core/services/pagos.service";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import type { AfiliadoConPlanes, Pago } from "@legalmene/shared";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

import type { TableLazyLoadEvent } from "primeng/table";

@Component({
  selector: "lm-pagos",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CardModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ButtonModule,
    TableModule,
    TagModule,
    CriteriosBusquedaComponent,
  ],
  template: `
    <p-card [style]="{ 'margin-bottom': '16px', display: 'block' }">
      <ng-template pTemplate="header">
        <div style="padding:16px 16px 0;">
          <h2 style="margin:0;">Iniciar pago WebPay</h2>
          <small class="lm-muted">Demo (stub Transbank); orden de compra generada localmente</small>
        </div>
      </ng-template>
      <form [formGroup]="form" (ngSubmit)="iniciar()" class="lm-row">
        <p-select
          formControlName="afiliadoId"
          [options]="afiliadoOpts()"
          optionLabel="label"
          optionValue="value"
          [filter]="true"
          filterBy="label"
          appendTo="body"
          placeholder="Selecciona afiliado"
          [style]="{ 'min-width': '280px' }"
          styleClass="lm-grow"
          (onChange)="elegirAfiliado($event.value)"
        ></p-select>
        <p-select
          formControlName="codPlan"
          [options]="planOpts()"
          optionLabel="label"
          optionValue="value"
          appendTo="body"
          placeholder="Plan"
          [style]="{ 'min-width': '200px' }"
        ></p-select>
        <p-inputNumber formControlName="monto" mode="decimal" [min]="1" placeholder="Monto (CLP)" [style]="{ width: '160px' }"></p-inputNumber>
        <button pButton type="submit" label="Iniciar pago" [disabled]="form.invalid || iniciando()"></button>
      </form>
    </p-card>

    <p-card>
      <ng-template pTemplate="header">
        <div class="lm-row" style="padding:16px 16px 0;">
          <h2 style="margin:0; flex:1;">Búsqueda de pagos WebPay</h2>
        </div>
      </ng-template>

      <lm-criterios-busqueda
        [campos]="['correlativo', 'rut', 'plan', 'fechas']"
        [estados]="estadoOpts"
        etiquetaCorrelativo="Número de orden"
        placeholderCorrelativo="OC-…"
        [exportable]="true"
        [puedeExportar]="!!criterios()"
        (buscar)="buscar($event)"
        (exportar)="exportar($event)"
        (limpiado)="criterios.set(null)"
      ></lm-criterios-busqueda>
      <div *ngIf="!criterios()" class="lm-vacio-busqueda">
        <i class="pi pi-search"></i>
        <p>Ingrese criterios y presione Buscar</p>
      </div>
      <p-table
        *ngIf="criterios()"
        [style]="{ 'margin-top': '16px' }"
        [value]="data()"
        [lazy]="true"
        (onLazyLoad)="onLazy($event)"
        [paginator]="true"
        [rows]="pageSize()"
        [totalRecords]="total()"
        [rowsPerPageOptions]="[25, 50]"
        [loading]="loading()"
        [first]="(page() - 1) * pageSize()"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th>Orden</th>
            <th>Monto</th>
            <th>Estado</th>
            <th>Proveedor</th>
            <th>Iniciado</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-p>
          <tr>
            <td>{{ p.ordenCompra }}</td>
            <td>{{ p.monto | currency: p.moneda : 'symbol-narrow' : '1.0-0' }}</td>
            <td><p-tag [value]="p.estado" [severity]="estadoSeverity(p.estado)"></p-tag></td>
            <td>{{ p.proveedor }}</td>
            <td>{{ p.fechaIniciado | date: 'short' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" style="text-align:center; padding:24px;" class="lm-muted">Sin pagos.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class PagosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(PagosApiService);
  private afiliadosApi = inject(AfiliadosApiService);
  private msg = inject(MessageService);

  protected data = signal<Pago[]>([]);
  protected afiliados = signal<AfiliadoConPlanes[]>([]);
  protected planOpts = signal<{ label: string; value: string }[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected iniciando = signal(false);
  protected criterios = signal<Criterios | null>(null);

  protected estadoOpts = [
    { label: "Iniciado", value: "Iniciado" },
    { label: "Autorizado", value: "Autorizado" },
    { label: "Rechazado", value: "Rechazado" },
    { label: "Anulado", value: "Anulado" },
    { label: "Reembolsado", value: "Reembolsado" },
  ];

  protected afiliadoOpts = () =>
    this.afiliados().map((a) => ({
      label: `${a.rut} — ${a.apellidoPaterno}, ${a.nombres}`,
      value: a.id,
    }));

  protected form = this.fb.group({
    afiliadoId: ["", Validators.required],
    codPlan: ["", Validators.required],
    monto: [10000, [Validators.required, Validators.min(1)]],
  });

  ngOnInit() {
    this.afiliadosApi.buscar({ pageSize: 200 }).subscribe((res) => this.afiliados.set(res.data));
  }

  // "Correlativo" del formulario es el número de orden de compra.
  private params(c: Criterios) {
    const { correlativo, ...resto } = c;
    return { ...resto, ordenCompra: correlativo };
  }

  buscar(c: Criterios) {
    this.criterios.set(c);
    this.page.set(1);
    this.recargar();
  }

  async exportar(c: Criterios) {
    try {
      await descargarArchivo("/exports/busquedas/pagos.xlsx", `pagos-webpay-${new Date().toISOString().slice(0, 10)}.xlsx`, { params: this.params(c) });
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo exportar", detail: (e as Error).message, life: 6000 });
    }
  }

  recargar() {
    const c = this.criterios();
    if (!c) return;
    this.loading.set(true);
    this.api.listar({ ...this.params(c), page: this.page(), pageSize: this.pageSize() }).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onLazy(ev: TableLazyLoadEvent) {
    const rows = ev.rows ?? this.pageSize();
    const page = Math.floor((ev.first ?? 0) / rows) + 1;
    if (page === this.page() && rows === this.pageSize() && this.data().length) return;
    this.page.set(page);
    this.pageSize.set(rows);
    this.recargar();
  }

  // El pago queda asociado a un plan del afiliado (vigente primero).
  elegirAfiliado(afiliadoId: string | null) {
    const afi = this.afiliados().find((a) => a.id === afiliadoId);
    const planes = afi?.planes ?? [];
    this.planOpts.set(
      planes.map((p) => ({ label: `${p.codPlan}${p.vigente ? "" : " (no vigente)"}`, value: p.codPlan })),
    );
    this.form.patchValue({ codPlan: planes[0]?.codPlan ?? "" });
  }

  iniciar() {
    if (this.form.invalid) return;
    this.iniciando.set(true);
    const v = this.form.value;
    this.api
      .iniciar({
        afiliadoId: v.afiliadoId!,
        codPlan: v.codPlan!,
        monto: v.monto!,
        returnUrl: `${window.location.origin}/pagos/return`,
      })
      .subscribe({
        next: (res) => {
          this.iniciando.set(false);
          this.msg.add({ severity: "success", summary: `Pago iniciado: ${res.pago.ordenCompra}`, life: 3000 });
          this.recargar();
        },
        error: (err) => {
          this.iniciando.set(false);
          this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 });
        },
      });
  }

  estadoSeverity(e: string): Severity {
    if (e === "Autorizado") return "success";
    if (e === "Rechazado" || e === "Anulado") return "danger";
    if (e === "Reembolsado") return "secondary";
    return "info";
  }
}
