import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TagModule } from "primeng/tag";
import { AccordionModule } from "primeng/accordion";
import { PaginatorModule, PaginatorState } from "primeng/paginator";
import { AuditApiService, AuditRow } from "../../core/services/audit.service";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

@Component({
  selector: "lm-auditoria",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    InputTextModule,
    SelectModule,
    TagModule,
    AccordionModule,
    PaginatorModule,
  ],
  template: `
    <p-card>
      <ng-template pTemplate="header">
        <div style="padding:16px 16px 0;">
          <h2 style="margin:0;">Auditoría</h2>
          <small class="lm-muted">Registro append-only de cambios (Ley 19.628)</small>
        </div>
      </ng-template>

      <div class="lm-row" style="margin-bottom:16px;">
        <p-select
          [(ngModel)]="filtroEntidad"
          (onChange)="recargar()"
          [options]="entidadOpts"
          optionLabel="label"
          optionValue="value"
          placeholder="Entidad"
          [showClear]="true"
          [style]="{ 'min-width': '180px' }"
        ></p-select>
        <input
          pInputText
          type="text"
          [(ngModel)]="filtroEntidadId"
          (keyup.enter)="recargar()"
          placeholder="ID entidad"
          style="flex:1;"
        />
      </div>

      <p-accordion>
        <p-accordion-panel *ngFor="let row of data(); let i = index" [value]="i">
          <p-accordion-header>
            <div class="lm-row" style="flex:1;">
              <p-tag [value]="row.accion" [severity]="accionSeverity(row.accion)"></p-tag>
              <strong>{{ row.entidad }}</strong>
              <small class="lm-muted">{{ row.entidadId | slice: 0:8 }}…</small>
              <span class="lm-grow"></span>
              <small class="lm-muted">{{ row.actorEmail }} · {{ row.timestamp | date: 'short' }}</small>
              <small *ngIf="row.codPlan" class="lm-muted">[plan {{ row.codPlan }}]</small>
            </div>
          </p-accordion-header>
          <p-accordion-content>
            <div *ngIf="row.cambios?.after as after" style="margin-bottom:8px;">
              <strong>Estado resultante:</strong>
              <pre style="background:#f5f5f5; padding:8px; border-radius:4px; overflow-x:auto; max-height:300px;">{{ after | json }}</pre>
            </div>
            <div *ngIf="row.cambios?.requestBody as req">
              <strong>Request:</strong>
              <pre style="background:#f5f5f5; padding:8px; border-radius:4px; overflow-x:auto; max-height:200px;">{{ req | json }}</pre>
            </div>
            <small class="lm-muted">IP: {{ row.ip || '—' }} · {{ row.userAgent || '—' }}</small>
          </p-accordion-content>
        </p-accordion-panel>
      </p-accordion>

      <p *ngIf="!data().length && !loading()" class="lm-muted">Sin registros.</p>

      <p-paginator
        [first]="(page() - 1) * pageSize()"
        [rows]="pageSize()"
        [totalRecords]="total()"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onPageChange)="onPage($event)"
      ></p-paginator>
    </p-card>
  `,
})
export class AuditoriaComponent implements OnInit {
  private api = inject(AuditApiService);

  protected data = signal<AuditRow[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(50);
  protected loading = signal(false);
  protected filtroEntidad: string | undefined;
  protected filtroEntidadId = "";

  protected entidadOpts = [
    { label: "Afiliados", value: "afiliados" },
    { label: "Atenciones", value: "atenciones" },
    { label: "Gestiones", value: "gestiones" },
    { label: "Comités", value: "comites" },
    { label: "Documentos", value: "documentos" },
    { label: "Pagos", value: "pagos" },
  ];

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api
      .listar({
        page: this.page(),
        pageSize: this.pageSize(),
        entidad: this.filtroEntidad,
        entidadId: this.filtroEntidadId.trim() || undefined,
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

  onPage(ev: PaginatorState) {
    const rows = ev.rows ?? this.pageSize();
    const first = ev.first ?? 0;
    this.page.set(Math.floor(first / rows) + 1);
    this.pageSize.set(rows);
    this.recargar();
  }

  accionSeverity(a: string): Severity {
    if (a === "CREATE") return "success";
    if (a === "DELETE") return "danger";
    return "info";
  }
}
