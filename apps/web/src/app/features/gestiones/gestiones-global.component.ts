import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { CheckboxModule } from "primeng/checkbox";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { GestionesGlobalService, GestionGlobalRow } from "../../core/services/gestiones-global.service";
import { PromptService } from "../../shared/prompt.service";
import type { TableLazyLoadEvent } from "primeng/table";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

@Component({
  selector: "lm-gestiones-global",
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
    CheckboxModule,
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
    <p-card>
      <ng-template pTemplate="header">
        <div style="padding:16px 16px 0;">
          <h2 style="margin:0;">Gestiones</h2>
          <small class="lm-muted">Vista operacional cross-atención</small>
        </div>
      </ng-template>

      <div class="lm-row" style="margin-bottom:16px;">
        <p-select
          [(ngModel)]="filtroEstado"
          (onChange)="recargar()"
          [options]="estadoOpts"
          optionLabel="label"
          optionValue="value"
          placeholder="Estado"
          [showClear]="true"
          [style]="{ 'min-width': '140px' }"
        ></p-select>
        <p-select
          [(ngModel)]="filtroTipo"
          (onChange)="recargar()"
          [options]="tipoOpts"
          optionLabel="label"
          optionValue="value"
          placeholder="Tipo"
          [showClear]="true"
          [style]="{ 'min-width': '180px' }"
        ></p-select>
        <div class="lm-row" style="gap:8px;">
          <p-checkbox [(ngModel)]="soloVencidas" (onChange)="recargar()" [binary]="true" inputId="vencidas"></p-checkbox>
          <label for="vencidas">Solo vencidas</label>
        </div>
        <span class="lm-grow"></span>
        <span class="lm-muted">{{ total() }} resultados</span>
      </div>

      <p-table
        [value]="data()"
        [lazy]="true"
        (onLazyLoad)="onLazy($event)"
        [paginator]="true"
        [rows]="pageSize()"
        [totalRecords]="total()"
        [rowsPerPageOptions]="[25, 50, 100]"
        [loading]="loading()"
        [first]="(page() - 1) * pageSize()"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th>Estado</th>
            <th>Título</th>
            <th>Atención</th>
            <th>Responsable</th>
            <th>Compromiso</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-g>
          <tr>
            <td><p-tag [value]="estadoLabel(g)" [severity]="estadoSeverity(g)"></p-tag></td>
            <td>
              <div>{{ g.titulo }}</div>
              <small class="lm-muted">{{ g.tipo }}</small>
            </td>
            <td>
              <a [routerLink]="['/atenciones', g.atencionId]" style="text-decoration:none; color:#1976d2;">{{ g.correlativo }}</a>
              <div><small class="lm-muted">{{ g.atencionMateria }}</small></div>
            </td>
            <td>{{ g.responsableEmail }}</td>
            <td>
              <span [style.color]="esVencida(g) ? '#d32f2f' : null">
                {{ g.fechaCompromiso ? (g.fechaCompromiso | date: 'short') : '—' }}
              </span>
            </td>
            <td>
              <button
                pButton
                *ngIf="g.estado === 'Pendiente'"
                icon="pi pi-check-circle"
                [text]="true"
                severity="success"
                (click)="completar(g)"
                pTooltip="Marcar completada"
              ></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="6" style="text-align:center; padding:24px;" class="lm-muted">Sin gestiones.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class GestionesGlobalComponent implements OnInit {
  private api = inject(GestionesGlobalService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);

  protected data = signal<GestionGlobalRow[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(50);
  protected loading = signal(false);
  protected filtroEstado: string | undefined;
  protected filtroTipo: string | undefined;
  protected soloVencidas = false;
  protected tipos = [
    "LlamadaTelefonica", "Email", "Reunion", "EscritoJudicial", "Audiencia",
    "Notificacion", "AnalisisDocumental", "Resolucion", "Otra",
  ];
  protected tipoOpts = this.tipos.map((t) => ({ label: t, value: t }));
  protected estadoOpts = [
    { label: "Pendiente", value: "Pendiente" },
    { label: "Completada", value: "Completada" },
    { label: "Vencida", value: "Vencida" },
    { label: "Cancelada", value: "Cancelada" },
  ];

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api
      .listarGlobal({
        page: this.page(),
        pageSize: this.pageSize(),
        estado: this.filtroEstado,
        tipo: this.filtroTipo,
        soloVencidas: this.soloVencidas,
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

  async completar(g: GestionGlobalRow) {
    const resultado = await this.prompt.open({
      header: `Completar: ${g.titulo}`,
      label: "Resultado",
      multiline: true,
      required: true,
    });
    if (!resultado) return;
    this.api.completar(g.id, { resultado }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Gestión completada", life: 2000 });
        this.recargar();
      },
      error: (err) =>
        this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }

  esVencida(g: GestionGlobalRow): boolean {
    if (g.estado !== "Pendiente" || !g.fechaCompromiso) return false;
    return new Date(g.fechaCompromiso).getTime() < Date.now();
  }

  estadoLabel(g: GestionGlobalRow): string {
    return this.esVencida(g) ? "Vencida" : g.estado;
  }

  estadoSeverity(g: GestionGlobalRow): Severity {
    if (g.estado === "Completada") return "success";
    if (this.esVencida(g) || g.estado === "Cancelada") return "danger";
    return "warn";
  }
}
