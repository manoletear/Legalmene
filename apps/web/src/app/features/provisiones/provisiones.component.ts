import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import type { TableLazyLoadEvent } from "primeng/table";
import { ESTADO_PROVISION_LABEL, EstadoProvisionEnum, type EstadoProvision } from "@legalmene/shared";
import { ProvisionesApiService, ProvisionRow } from "../../core/services/provisiones.service";
import { MeService } from "../../core/services/me.service";
import { PromptService } from "../../shared/prompt.service";
import { CriteriosBusquedaComponent, type Criterios } from "../../shared/criterios-busqueda.component";
import { descargarArchivo } from "../../shared/descarga";
import { AccionProvision, accionesProvision, severidadProvision } from "../../shared/provision-acciones";
import { Observable } from "rxjs";

@Component({
  selector: "lm-provisiones",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CardModule, SelectModule, ButtonModule, TableModule, TagModule, CriteriosBusquedaComponent],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Provisiones de fondos</h1>
        <small class="lm-muted">
          Ciclo del Anexo: el abogado solicita, Contador registra el pago del cliente, la jefatura autoriza la entrega,
          Finanzas pone los fondos a disposición y los entrega, y el abogado rinde los gastos.
        </small>
      </div>
    </div>

    <p-card>
      <lm-criterios-busqueda
        [campos]="['correlativo', 'rut', 'abogado', 'plan', 'fechas']"
        [estados]="estadoOpts"
        [iniciales]="iniciales"
        etiquetaFecha="Solicitud"
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
            <td style="text-align:right;">
              $ {{ p.monto | number }}
              <div *ngIf="p.montoEntregado !== null" class="lm-small lm-muted">entregado $ {{ p.montoEntregado | number }}</div>
            </td>
            <td><p-tag [value]="etiqueta(p.estado)" [severity]="severidad(p.estado)"></p-tag>
              <div *ngIf="p.numeroCheque" class="lm-small lm-muted">Cheque {{ p.numeroCheque }}</div></td>
            <td class="lm-small">{{ p.solicitadaPorEmail }}</td>
            <td class="lm-small">{{ p.fechaSolicitud | date: 'dd/MM/yyyy' }}</td>
            <td style="text-align:right; white-space:nowrap;">
              <button
                *ngFor="let ac of acciones(p)"
                pButton
                type="button"
                class="p-button-sm p-button-text"
                [severity]="ac.severidad ?? 'primary'"
                [label]="ac.label"
                (click)="ejecutar(p, ac)"
              ></button>
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
  private route = inject(ActivatedRoute);

  protected data = signal<ProvisionRow[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected criterios = signal<Criterios | null>(null);
  protected iniciales: Criterios = {};
  protected estadoOpts = EstadoProvisionEnum.options.map((value) => ({ label: ESTADO_PROVISION_LABEL[value], value }));

  ngOnInit() {
    // La bandeja de Finanzas y el dashboard enlazan aquí con ?estado=...: búsqueda explícita.
    const estado = this.route.snapshot.queryParamMap.get("estado");
    if (estado) {
      this.iniciales = { estado };
      this.buscar({ estado });
    }
  }

  buscar(c: Criterios) {
    this.criterios.set(c);
    this.page.set(1);
    this.recargar();
  }

  async exportar(c: Criterios) {
    try {
      await descargarArchivo("/exports/busquedas/provisiones.xlsx", `provisiones-${new Date().toISOString().slice(0, 10)}.xlsx`, { params: c });
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo exportar", detail: (e as Error).message, life: 6000 });
    }
  }

  recargar() {
    const c = this.criterios();
    if (!c) return;
    this.loading.set(true);
    this.api.listar({ ...c, page: this.page(), pageSize: this.pageSize() }).subscribe({
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

  protected etiqueta(e: EstadoProvision): string {
    return ESTADO_PROVISION_LABEL[e];
  }

  protected severidad = severidadProvision;

  protected acciones(p: ProvisionRow): AccionProvision[] {
    return accionesProvision(p.estado, this.me.permisos());
  }

  private async monto(header: string): Promise<number | null> {
    const txt = await this.prompt.open({ header, label: "Monto en pesos", required: true });
    if (!txt) return null;
    const n = Number(txt.replace(/[.\s$]/g, ""));
    if (!Number.isInteger(n) || n <= 0) {
      this.msg.add({ severity: "warn", summary: "Monto inválido", life: 3000 });
      return null;
    }
    return n;
  }

  async ejecutar(p: ProvisionRow, ac: AccionProvision) {
    let req: Observable<unknown> | null = null;
    switch (ac.id) {
      case "pago": {
        const medio = await this.prompt.open({ header: "Pago del cliente", label: "Medio (WebPay, CasaCentral o Transferencia)", initialValue: "Transferencia", required: true });
        if (!medio) return;
        if (!["WebPay", "CasaCentral", "Transferencia"].includes(medio.trim())) {
          this.msg.add({ severity: "warn", summary: "Medio inválido", detail: "Use WebPay, CasaCentral o Transferencia", life: 4000 });
          return;
        }
        req = this.api.pagoCliente(p.id, medio.trim() as "WebPay");
        break;
      }
      case "solicitarEntrega":
        req = this.api.solicitarEntrega(p.id);
        break;
      case "autorizar": {
        const obs = await this.prompt.open({ header: `Autorizar entrega de $ ${p.monto.toLocaleString("es-CL")}`, label: "Observación (opcional)", multiline: true });
        if (obs === null) return;
        req = this.api.autorizar(p.id, obs.trim() || undefined);
        break;
      }
      case "rechazarEntrega": {
        const obs = await this.prompt.open({ header: "Rechazar entrega", label: "Motivo", multiline: true, required: true });
        if (!obs) return;
        req = this.api.rechazarEntrega(p.id, obs);
        break;
      }
      case "disponible":
        req = this.api.disponible(p.id);
        break;
      case "entregar":
        req = this.api.entregar(p.id);
        break;
      case "gasto":
      case "reintegro": {
        const monto = await this.monto(ac.id === "gasto" ? `Gasto contra ${p.correlativo}` : `Reintegro de saldo de ${p.correlativo}`);
        if (monto === null) return;
        const glosa = await this.prompt.open({ header: ac.id === "gasto" ? "Detalle del gasto" : "Detalle del reintegro", label: "Glosa", required: true });
        if (!glosa) return;
        req = this.api.registrarMovimiento(p.id, { tipo: ac.id === "gasto" ? "Gasto" : "Reintegro", monto, glosa });
        break;
      }
      case "rendir":
        req = this.api.rendir(p.id);
        break;
      case "devolucion": {
        const cheque = await this.prompt.open({ header: "Devolución al cliente", label: "Número de cheque", required: true });
        if (!cheque) return;
        req = this.api.devolucion(p.id, cheque.trim());
        break;
      }
    }
    req?.subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: ac.label, detail: p.correlativo, life: 2500 });
        this.recargar();
      },
      error: (err) => this.msg.add({ severity: "error", summary: "No se pudo completar", detail: err.error?.message ?? err.message, life: 6000 }),
    });
  }
}
