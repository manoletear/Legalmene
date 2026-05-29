import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatTableModule } from "@angular/material/table";
import { MatChipsModule } from "@angular/material/chips";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { AuditApiService, AuditRow } from "../../core/services/audit.service";

@Component({
  selector: "lm-auditoria",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatChipsModule,
    MatExpansionModule,
    MatPaginatorModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Auditoría</mat-card-title>
        <mat-card-subtitle>Registro append-only de cambios (Ley 19.628)</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div style="display:flex; gap:12px; margin-bottom:16px;">
          <mat-form-field appearance="outline" style="min-width:180px">
            <mat-label>Entidad</mat-label>
            <mat-select [(ngModel)]="filtroEntidad" (selectionChange)="recargar()">
              <mat-option [value]="undefined">Todas</mat-option>
              <mat-option value="afiliados">Afiliados</mat-option>
              <mat-option value="atenciones">Atenciones</mat-option>
              <mat-option value="gestiones">Gestiones</mat-option>
              <mat-option value="comites">Comités</mat-option>
              <mat-option value="documentos">Documentos</mat-option>
              <mat-option value="pagos">Pagos</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="flex:1">
            <mat-label>ID entidad</mat-label>
            <input matInput [(ngModel)]="filtroEntidadId" (keyup.enter)="recargar()" />
          </mat-form-field>
        </div>

        <div *ngFor="let row of data()" style="margin-bottom:8px;">
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title>
                <mat-chip [color]="accionColor(row.accion)" highlighted style="margin-right:8px;">{{ row.accion }}</mat-chip>
                <strong>{{ row.entidad }}</strong>
                <small style="margin-left:8px; opacity:0.6;">{{ row.entidadId | slice: 0:8 }}…</small>
              </mat-panel-title>
              <mat-panel-description>
                {{ row.actorEmail }} · {{ row.timestamp | date: 'short' }}
                <span *ngIf="row.codPlan" style="margin-left:8px;">[plan {{ row.codPlan }}]</span>
              </mat-panel-description>
            </mat-expansion-panel-header>

            <div *ngIf="row.cambios?.after as after" style="margin-bottom:8px;">
              <strong>Estado resultante:</strong>
              <pre style="background:#f5f5f5; padding:8px; border-radius:4px; overflow-x:auto; max-height:300px;">{{ after | json }}</pre>
            </div>
            <div *ngIf="row.cambios?.requestBody as req">
              <strong>Request:</strong>
              <pre style="background:#f5f5f5; padding:8px; border-radius:4px; overflow-x:auto; max-height:200px;">{{ req | json }}</pre>
            </div>
            <small style="opacity:0.6;">IP: {{ row.ip || '—' }} · {{ row.userAgent || '—' }}</small>
          </mat-expansion-panel>
        </div>

        <p *ngIf="!data().length && !loading()" style="opacity:0.5;">Sin registros.</p>

        <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
      </mat-card-content>
    </mat-card>
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

  onPage(ev: PageEvent) {
    this.page.set(ev.pageIndex + 1);
    this.pageSize.set(ev.pageSize);
    this.recargar();
  }

  accionColor(a: string) {
    if (a === "CREATE") return "primary";
    if (a === "DELETE") return "warn";
    return "accent";
  }
}
