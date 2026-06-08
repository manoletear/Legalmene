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
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { PagosApiService } from "../../core/services/pagos.service";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import type { Afiliado, Pago } from "@legalmene/shared";

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
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
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
        ></p-select>
        <p-inputNumber formControlName="monto" mode="decimal" [min]="1" placeholder="Monto (CLP)" [style]="{ width: '160px' }"></p-inputNumber>
        <button pButton type="submit" label="Iniciar pago" [disabled]="form.invalid || iniciando()"></button>
      </form>
    </p-card>

    <p-card>
      <ng-template pTemplate="header">
        <div class="lm-row" style="padding:16px 16px 0;">
          <h2 style="margin:0; flex:1;">Historial</h2>
          <p-select
            [(ngModel)]="filtroEstado"
            (onChange)="setEstado($event.value)"
            [options]="estadoOpts"
            optionLabel="label"
            optionValue="value"
            placeholder="Estado"
            [showClear]="true"
            [style]="{ width: '180px' }"
          ></p-select>
        </div>
      </ng-template>

      <p-table
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
  protected afiliados = signal<Afiliado[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected iniciando = signal(false);
  protected filtroEstado: string | undefined;

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
    monto: [10000, [Validators.required, Validators.min(1)]],
  });

  ngOnInit() {
    this.afiliadosApi.buscar({ pageSize: 200 }).subscribe((res) => this.afiliados.set(res.data));
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
    const first = ev.first ?? 0;
    const rows = ev.rows ?? this.pageSize();
    this.page.set(Math.floor(first / rows) + 1);
    this.pageSize.set(rows);
    this.recargar();
  }

  iniciar() {
    if (this.form.invalid) return;
    this.iniciando.set(true);
    const v = this.form.value;
    this.api
      .iniciar({
        afiliadoId: v.afiliadoId!,
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
