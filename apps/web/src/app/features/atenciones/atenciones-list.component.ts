import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatChipsModule } from "@angular/material/chips";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { environment } from "../../../environments/environment";
import type { Atencion } from "@legalmene/shared";

@Component({
  selector: "lm-atenciones-list",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatTableModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatPaginatorModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Atenciones</mat-card-title>
        <span style="flex:1"></span>
        <button mat-stroked-button (click)="exportarCsv()" style="margin-right:8px;">
          <mat-icon>download</mat-icon> Exportar CSV
        </button>
        <button mat-flat-button color="primary" routerLink="/atenciones/nueva">
          <mat-icon>add</mat-icon> Nueva consulta
        </button>
      </mat-card-header>

      <mat-card-content>
        <div style="display:flex; gap:12px; align-items:center; margin:16px 0;">
          <mat-form-field appearance="outline" style="min-width:140px">
            <mat-label>Tipo</mat-label>
            <mat-select [(ngModel)]="filtroTipo" (selectionChange)="recargar()">
              <mat-option [value]="undefined">Todos</mat-option>
              <mat-option value="Consulta">Consulta</mat-option>
              <mat-option value="Asesoria">Asesoría</mat-option>
              <mat-option value="Juicio">Juicio</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="min-width:140px">
            <mat-label>Estado</mat-label>
            <mat-select [(ngModel)]="filtroEstado" (selectionChange)="recargar()">
              <mat-option [value]="undefined">Todos</mat-option>
              <mat-option value="Abierta">Abierta</mat-option>
              <mat-option value="EnGestion">En gestión</mat-option>
              <mat-option value="EnComite">En comité</mat-option>
              <mat-option value="Suspendida">Suspendida</mat-option>
              <mat-option value="Cerrada">Cerrada</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="min-width:180px">
            <mat-label>Correlativo</mat-label>
            <input matInput [(ngModel)]="filtroCorrelativo" (keyup.enter)="recargar()" placeholder="CONS-2026-..." />
          </mat-form-field>
          <mat-form-field appearance="outline" style="flex:1">
            <mat-label>Buscar (materia, descripción)</mat-label>
            <input matInput [(ngModel)]="filtroQ" (keyup.enter)="recargar()" placeholder="ej. despido, alimentos…" />
          </mat-form-field>
        </div>

        <table mat-table [dataSource]="data()" *ngIf="data().length; else vacio">
          <ng-container matColumnDef="correlativo">
            <th mat-header-cell *matHeaderCellDef>Correlativo</th>
            <td mat-cell *matCellDef="let a">
              <a [routerLink]="['/atenciones', a.id]" style="text-decoration:none">{{ a.correlativo }}</a>
            </td>
          </ng-container>
          <ng-container matColumnDef="tipo">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let a"><mat-chip [color]="tipoColor(a.tipo)" highlighted>{{ a.tipo }}</mat-chip></td>
          </ng-container>
          <ng-container matColumnDef="materia">
            <th mat-header-cell *matHeaderCellDef>Materia</th>
            <td mat-cell *matCellDef="let a">{{ a.materia }} <small style="opacity:0.6">({{ a.competencia }})</small></td>
          </ng-container>
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let a"><mat-chip [color]="estadoColor(a.estado)" highlighted>{{ a.estado }}</mat-chip></td>
          </ng-container>
          <ng-container matColumnDef="prioridad">
            <th mat-header-cell *matHeaderCellDef>Prioridad</th>
            <td mat-cell *matCellDef="let a">{{ a.prioridad }}</td>
          </ng-container>
          <ng-container matColumnDef="fecha">
            <th mat-header-cell *matHeaderCellDef>Apertura</th>
            <td mat-cell *matCellDef="let a">{{ a.fechaApertura | date: 'dd/MM/yyyy' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>

        <ng-template #vacio>
          <p *ngIf="!loading()">No hay atenciones.</p>
          <p *ngIf="loading()">Cargando…</p>
        </ng-template>

        <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageSizeOptions]="[10, 25, 50, 100]" (page)="onPage($event)" />
      </mat-card-content>
    </mat-card>
  `,
})
export class AtencionesListComponent implements OnInit {
  private api = inject(AtencionesApiService);
  protected cols = ["correlativo", "tipo", "materia", "estado", "prioridad", "fecha"];
  protected data = signal<Atencion[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected filtroTipo: "Consulta" | "Asesoria" | "Juicio" | undefined;
  protected filtroEstado: string | undefined;
  protected filtroCorrelativo = "";
  protected filtroQ = "";

  ngOnInit() {
    this.recargar();
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

  onPage(ev: PageEvent) {
    this.page.set(ev.pageIndex + 1);
    this.pageSize.set(ev.pageSize);
    this.recargar();
  }

  tipoColor(t: string) {
    return t === "Juicio" ? "warn" : t === "Asesoria" ? "accent" : "primary";
  }

  estadoColor(e: string) {
    if (e === "Cerrada" || e === "Archivada") return undefined;
    if (e === "EnComite") return "warn";
    if (e === "Suspendida") return "warn";
    return "primary";
  }

  // Export: navega al endpoint en una nueva tab (browser maneja download).
  exportarCsv() {
    const codPlan = localStorage.getItem("cod_plan") ?? "DEMO";
    const url = `${environment.apiBaseUrl}/exports/atenciones.csv`;
    // Necesita header X-Cod-Plan, así que fetch + blob en vez de window.open.
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
