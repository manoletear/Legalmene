import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { MessageService } from "primeng/api";
import { ESTADO_PROVISION_LABEL, type CuentaCorrienteAbogado, type EstadoProvision } from "@legalmene/shared";
import { environment } from "../../../environments/environment";
import { descargarArchivo } from "../../shared/descarga";
import { severidadProvision } from "../../shared/provision-acciones";

// Cuenta corriente por abogado (Anexo §X 12): lo que Finanzas debe entregar y lo que cada abogado
// tiene por rendir o por reingresar.
@Component({
  selector: "lm-cuenta-corriente",
  standalone: true,
  imports: [CommonModule, RouterLink, CardModule, TableModule, TagModule, ButtonModule],
  template: `
    <div style="margin-bottom:16px;">
      <h1 style="margin:0 0 4px 0;">Cuenta corriente por abogado</h1>
      <small class="lm-muted">Fondos autorizados por entregar, entregados por rendir y saldos por reingresar.</small>
    </div>
    <p-card>
      <p-table [value]="cuentas()" dataKey="abogadoId" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th style="width:40px;"></th><th>Abogado</th><th style="text-align:right;">Por entregar</th><th style="text-align:right;">Por rendir</th><th style="text-align:right;">Por reingresar</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-c let-expanded="expanded">
          <tr>
            <td><button type="button" pButton [pRowToggler]="c" [text]="true" size="small" [icon]="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" [attr.aria-label]="'Detalle de ' + c.abogadoNombre"></button></td>
            <td>{{ c.abogadoNombre }}</td>
            <td style="text-align:right;">$ {{ c.porEntregar | number }}</td>
            <td style="text-align:right;" [style.color]="c.porRendir > 0 ? '#b45309' : null">$ {{ c.porRendir | number }}</td>
            <td style="text-align:right;" [style.color]="c.porReingresar > 0 ? '#b45309' : null">$ {{ c.porReingresar | number }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="expandedrow" let-c>
          <tr>
            <td colspan="5" style="padding:0 0 8px 40px;">
              <table style="width:100%; border-collapse:collapse;" class="lm-small">
                <tr *ngFor="let p of c.provisiones" style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:6px 4px;"><a [routerLink]="['/atenciones', p.atencionId]" class="lm-mono">{{ p.correlativo }}</a></td>
                  <td style="padding:6px 4px;">{{ p.motivo }}</td>
                  <td style="padding:6px 4px;"><p-tag [value]="etiqueta(p.estado)" [severity]="severidad(p.estado)"></p-tag></td>
                  <td style="padding:6px 4px; text-align:right;">$ {{ p.saldo | number }}</td>
                  <td style="padding:6px 4px; text-align:right;">
                    <button *ngIf="p.fechaEntrega" pButton type="button" [text]="true" size="small" icon="pi pi-print" label="Comprobante de entrega" (click)="comprobante(p.id, p.correlativo)"></button>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" class="lm-muted" style="text-align:center; padding:24px;">No hay fondos por entregar, rendir ni reingresar.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class CuentaCorrienteComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  protected cuentas = signal<CuentaCorrienteAbogado[]>([]);
  protected loading = signal(false);

  ngOnInit() {
    this.loading.set(true);
    this.http.get<CuentaCorrienteAbogado[]>(`${environment.apiBaseUrl}/provisiones/cuenta-corriente`).subscribe({
      next: (c) => {
        this.cuentas.set(c);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.msg.add({ severity: "error", summary: "No se pudo cargar", detail: err.error?.message ?? err.message, life: 5000 });
      },
    });
  }

  protected etiqueta(e: EstadoProvision): string {
    return ESTADO_PROVISION_LABEL[e];
  }

  protected severidad(e: EstadoProvision) {
    return severidadProvision(e);
  }

  async comprobante(id: string, correlativo: string) {
    try {
      await descargarArchivo(`/exports/comprobantes/entrega/${id}.pdf`, `entrega-${correlativo}.pdf`);
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo generar el comprobante", detail: (e as Error).message, life: 5000 });
    }
  }
}
