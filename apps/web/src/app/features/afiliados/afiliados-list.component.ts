import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { IconFieldModule } from "primeng/iconfield";
import { InputIconModule } from "primeng/inputicon";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { environment } from "../../../environments/environment";
import type { Afiliado } from "@legalmene/shared";
import type { TableLazyLoadEvent } from "primeng/table";

@Component({
  selector: "lm-afiliados-list",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
  ],
  template: `
    <p-card>
      <ng-template pTemplate="header">
        <div style="display:flex; align-items:center; gap:8px; padding:16px 16px 0;">
          <h2 style="margin:0; flex:1;">Afiliados</h2>
          <button pButton type="button" icon="pi pi-download" label="Exportar CSV" [outlined]="true" (click)="exportarCsv()"></button>
        </div>
      </ng-template>

      <p-iconField iconPosition="left" style="width:100%; display:block; margin-bottom:16px;">
        <p-inputIcon styleClass="pi pi-search" />
        <input
          pInputText
          type="text"
          [(ngModel)]="query"
          (keyup.enter)="recargar()"
          placeholder="Buscar por RUT, nombre o email"
          style="width:100%;"
        />
      </p-iconField>

      <p-table
        [value]="data()"
        [lazy]="true"
        (onLazyLoad)="onLazy($event)"
        [paginator]="true"
        [rows]="pageSize()"
        [totalRecords]="total()"
        [rowsPerPageOptions]="[10, 25, 50, 100]"
        [loading]="loading()"
        [first]="(page() - 1) * pageSize()"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th>RUT</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Vigencia</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr>
            <td>{{ a.rut }}</td>
            <td>{{ a.apellidoPaterno }} {{ a.apellidoMaterno }}, {{ a.nombres }}</td>
            <td>{{ a.email }}</td>
            <td>{{ a.vigencia }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="4" style="text-align:center; padding:24px;" class="lm-muted">No hay afiliados.</td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class AfiliadosListComponent implements OnInit {
  private api = inject(AfiliadosApiService);
  protected data = signal<Afiliado[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected query = "";

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api
      .buscar({ page: this.page(), pageSize: this.pageSize(), q: this.query || undefined })
      .subscribe({
        next: (res) => {
          this.data.set(res.data);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onLazy(ev: TableLazyLoadEvent) {
    const first = ev.first ?? 0;
    const rows = ev.rows ?? this.pageSize();
    this.page.set(Math.floor(first / rows) + 1);
    this.pageSize.set(rows);
    this.recargar();
  }

  exportarCsv() {
    const codPlan = localStorage.getItem("cod_plan") ?? "DEMO";
    const url = `${environment.apiBaseUrl}/exports/afiliados.csv`;
    fetch(url, { headers: { "X-Cod-Plan": codPlan } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `afiliados-${codPlan}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  }
}
