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
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { GestionesGlobalService, GestionGlobalRow } from "../../core/services/gestiones-global.service";

@Component({
  selector: "lm-gestiones-global",
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
    MatCheckboxModule,
    MatPaginatorModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Gestiones</mat-card-title>
        <mat-card-subtitle>Vista operacional cross-atención</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px; flex-wrap:wrap;">
          <mat-form-field appearance="outline" style="min-width:140px">
            <mat-label>Estado</mat-label>
            <mat-select [(ngModel)]="filtroEstado" (selectionChange)="recargar()">
              <mat-option [value]="undefined">Todos</mat-option>
              <mat-option value="Pendiente">Pendiente</mat-option>
              <mat-option value="Completada">Completada</mat-option>
              <mat-option value="Vencida">Vencida</mat-option>
              <mat-option value="Cancelada">Cancelada</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="min-width:160px">
            <mat-label>Tipo</mat-label>
            <mat-select [(ngModel)]="filtroTipo" (selectionChange)="recargar()">
              <mat-option [value]="undefined">Todos</mat-option>
              <mat-option *ngFor="let t of tipos" [value]="t">{{ t }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-checkbox [(ngModel)]="soloVencidas" (change)="recargar()">Solo vencidas</mat-checkbox>
          <span style="flex:1"></span>
          <span style="opacity:0.7;">{{ total() }} resultados</span>
        </div>

        <table mat-table [dataSource]="data()" *ngIf="data().length; else vacio">
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let g">
              <mat-chip [color]="estadoColor(g)" highlighted>{{ estadoLabel(g) }}</mat-chip>
            </td>
          </ng-container>
          <ng-container matColumnDef="titulo">
            <th mat-header-cell *matHeaderCellDef>Título</th>
            <td mat-cell *matCellDef="let g">
              <div>{{ g.titulo }}</div>
              <small style="opacity:0.6;">{{ g.tipo }}</small>
            </td>
          </ng-container>
          <ng-container matColumnDef="atencion">
            <th mat-header-cell *matHeaderCellDef>Atención</th>
            <td mat-cell *matCellDef="let g">
              <a [routerLink]="['/atenciones', g.atencionId]" style="text-decoration:none;">{{ g.correlativo }}</a>
              <div><small style="opacity:0.6;">{{ g.atencionMateria }}</small></div>
            </td>
          </ng-container>
          <ng-container matColumnDef="responsable">
            <th mat-header-cell *matHeaderCellDef>Responsable</th>
            <td mat-cell *matCellDef="let g">{{ g.responsableEmail }}</td>
          </ng-container>
          <ng-container matColumnDef="compromiso">
            <th mat-header-cell *matHeaderCellDef>Compromiso</th>
            <td mat-cell *matCellDef="let g">
              <span [style.color]="esVencida(g) ? '#d32f2f' : null">
                {{ g.fechaCompromiso ? (g.fechaCompromiso | date: 'short') : '—' }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="acciones">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let g">
              <button mat-icon-button *ngIf="g.estado === 'Pendiente'" (click)="completar(g)" title="Marcar completada">
                <mat-icon>check_circle</mat-icon>
              </button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>

        <ng-template #vacio>
          <p *ngIf="!loading()" style="opacity:0.5;">Sin gestiones.</p>
          <p *ngIf="loading()">Cargando…</p>
        </ng-template>

        <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
      </mat-card-content>
    </mat-card>
  `,
})
export class GestionesGlobalComponent implements OnInit {
  private api = inject(GestionesGlobalService);
  private snack = inject(MatSnackBar);

  protected cols = ["estado", "titulo", "atencion", "responsable", "compromiso", "acciones"];
  protected data = signal<GestionGlobalRow[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(50);
  protected loading = signal(false);
  protected filtroEstado: string | undefined;
  protected filtroTipo: string | undefined;
  protected soloVencidas = false;
  protected tipos = [
    "LlamadaTelefonica",
    "Email",
    "Reunion",
    "EscritoJudicial",
    "Audiencia",
    "Notificacion",
    "AnalisisDocumental",
    "Resolucion",
    "Otra",
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

  onPage(ev: PageEvent) {
    this.page.set(ev.pageIndex + 1);
    this.pageSize.set(ev.pageSize);
    this.recargar();
  }

  completar(g: GestionGlobalRow) {
    const resultado = window.prompt(`Resultado de "${g.titulo}":`);
    if (!resultado) return;
    this.api.completar(g.id, { resultado }).subscribe({
      next: () => {
        this.snack.open("Gestión completada", "OK", { duration: 2000 });
        this.recargar();
      },
      error: (err) =>
        this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 4000 }),
    });
  }

  esVencida(g: GestionGlobalRow): boolean {
    if (g.estado !== "Pendiente" || !g.fechaCompromiso) return false;
    return new Date(g.fechaCompromiso).getTime() < Date.now();
  }

  estadoLabel(g: GestionGlobalRow): string {
    return this.esVencida(g) ? "Vencida" : g.estado;
  }

  estadoColor(g: GestionGlobalRow) {
    if (g.estado === "Completada") return "primary";
    if (this.esVencida(g) || g.estado === "Cancelada") return "warn";
    return "accent";
  }
}
