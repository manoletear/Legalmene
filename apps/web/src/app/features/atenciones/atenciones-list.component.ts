import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { InputTextModule } from "primeng/inputtext";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { environment } from "../../../environments/environment";
import type { Atencion } from "@legalmene/shared";
import type { TableLazyLoadEvent } from "primeng/table";

@Component({
  selector: "lm-atenciones-list",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    TableModule,
    TagModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
  ],
  template: `
    <p-card>
      <ng-template pTemplate="header">
        <div style="display:flex; align-items:center; gap:8px; padding:16px 16px 0;">
          <h2 style="margin:0; flex:1;">{{ titulo }}</h2>
          <button pButton icon="pi pi-download" label="Exportar CSV" [outlined]="true" (click)="exportarCsv()"></button>
          <button pButton icon="pi pi-plus" label="Nueva atención" routerLink="/atenciones/nueva"></button>
        </div>
      </ng-template>

      <div class="lm-row" style="margin:16px 0;">
        <p-select
          *ngIf="!tipoBloqueado"
          [(ngModel)]="filtroTipo"
          (onChange)="recargar()"
          [options]="tipoOpts"
          optionLabel="label"
          optionValue="value"
          placeholder="Tipo"
          [showClear]="true"
          styleClass="lm-grow"
          [style]="{ 'min-width': '140px' }"
        ></p-select>
        <p-select
          [(ngModel)]="filtroEstado"
          (onChange)="recargar()"
          [options]="estadoOpts"
          optionLabel="label"
          optionValue="value"
          placeholder="Estado"
          [showClear]="true"
          [style]="{ 'min-width': '160px' }"
        ></p-select>
        <input
          pInputText
          type="text"
          [(ngModel)]="filtroCorrelativo"
          (keyup.enter)="recargar()"
          placeholder="Correlativo (CONS-2026-…)"
          style="min-width:180px;"
        />
        <input
          pInputText
          type="text"
          [(ngModel)]="filtroQ"
          (keyup.enter)="recargar()"
          placeholder="Buscar (materia, descripción)"
          style="flex:1; min-width:200px;"
        />
      </div>

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
            <th>Correlativo</th>
            <th>Tipo</th>
            <th>Materia</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th>Apertura</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr>
            <td><a [routerLink]="['/atenciones', a.id]" style="text-decoration:none; color:#1976d2;">{{ a.correlativo }}</a></td>
            <td><p-tag [value]="a.tipo" [severity]="tipoSeverity(a.tipo)"></p-tag></td>
            <td>{{ a.materia }} <small class="lm-muted">({{ a.competencia }})</small></td>
            <td><p-tag [value]="a.estado" [severity]="estadoSeverity(a.estado)"></p-tag></td>
            <td>{{ a.prioridad }}</td>
            <td>{{ a.fechaApertura | date: 'dd/MM/yyyy' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="6" style="text-align:center; padding:24px;" class="lm-muted">No hay atenciones.</td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class AtencionesListComponent implements OnInit {
  private api = inject(AtencionesApiService);
  private route = inject(ActivatedRoute);
  protected data = signal<Atencion[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected tipoBloqueado = false;
  protected filtroTipo: "Consulta" | "Asesoria" | "Juicio" | undefined;
  protected filtroEstado: string | undefined;
  protected filtroCorrelativo = "";
  protected filtroQ = "";

  protected tipoOpts = [
    { label: "Consulta", value: "Consulta" },
    { label: "Asesoría", value: "Asesoria" },
    { label: "Juicio", value: "Juicio" },
  ];
  protected estadoOpts = [
    { label: "Abierta", value: "Abierta" },
    { label: "En gestión", value: "EnGestion" },
    { label: "En comité", value: "EnComite" },
    { label: "Suspendida", value: "Suspendida" },
    { label: "Cerrada", value: "Cerrada" },
  ];

  ngOnInit() {
    const tipoFiltro = this.route.snapshot.data["tipoFiltro"];
    if (tipoFiltro) {
      this.filtroTipo = tipoFiltro;
      this.tipoBloqueado = true;
    }
    this.recargar();
  }

  protected get titulo(): string {
    switch (this.filtroTipo) {
      case "Consulta": return "Consultas";
      case "Asesoria": return "Asesorías";
      case "Juicio": return "Juicios";
      default: return "Atenciones";
    }
  }

  recargar() {
    this.loading.set(true);
    this.api
      .buscar({
        page: this.page(),
        pageSize: this.pageSize(),
        tipo: this.filtroTipo,
        estado: this.filtroEstado,
        correlativo: this.filtroCorrelativo || undefined,
        q: this.filtroQ.trim() || undefined,
      })
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

  tipoSeverity(t: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" {
    return t === "Juicio" ? "danger" : t === "Asesoria" ? "warn" : "info";
  }

  estadoSeverity(e: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" {
    if (e === "Cerrada" || e === "Archivada") return "secondary";
    if (e === "EnComite" || e === "Suspendida") return "warn";
    return "info";
  }

  exportarCsv() {
    const codPlan = localStorage.getItem("cod_plan") ?? "DEMO";
    const url = `${environment.apiBaseUrl}/exports/atenciones.csv`;
    fetch(url, { headers: { "X-Cod-Plan": codPlan } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `atenciones-${codPlan}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  }
}
