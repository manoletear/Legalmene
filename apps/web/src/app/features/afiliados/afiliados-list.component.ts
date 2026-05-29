import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { environment } from "../../../environments/environment";
import type { Afiliado } from "@legalmene/shared";

@Component({
  selector: "lm-afiliados-list",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Afiliados</mat-card-title>
        <span style="flex:1"></span>
        <button mat-stroked-button (click)="exportarCsv()">
          <mat-icon>download</mat-icon> Exportar CSV
        </button>
      </mat-card-header>
      <mat-card-content>
        <mat-form-field appearance="outline" style="width: 100%; margin-bottom: 16px;">
          <mat-label>Buscar por RUT, nombre o email</mat-label>
          <input matInput [(ngModel)]="query" (keyup.enter)="recargar()" />
          <button mat-icon-button matSuffix (click)="recargar()">→</button>
        </mat-form-field>

        <table mat-table [dataSource]="data()" *ngIf="data().length; else vacio">
          <ng-container matColumnDef="rut">
            <th mat-header-cell *matHeaderCellDef>RUT</th>
            <td mat-cell *matCellDef="let a">{{ a.rut }}</td>
          </ng-container>
          <ng-container matColumnDef="nombre">
            <th mat-header-cell *matHeaderCellDef>Nombre</th>
            <td mat-cell *matCellDef="let a">{{ a.apellidoPaterno }} {{ a.apellidoMaterno }}, {{ a.nombres }}</td>
          </ng-container>
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let a">{{ a.email }}</td>
          </ng-container>
          <ng-container matColumnDef="vigencia">
            <th mat-header-cell *matHeaderCellDef>Vigencia</th>
            <td mat-cell *matCellDef="let a">{{ a.vigencia }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>

        <ng-template #vacio>
          <p *ngIf="!loading()">No hay afiliados.</p>
          <p *ngIf="loading()">Cargando...</p>
        </ng-template>

        <mat-paginator
          [length]="total()"
          [pageSize]="pageSize()"
          [pageSizeOptions]="[10, 25, 50, 100]"
          (page)="onPage($event)"
        />
      </mat-card-content>
    </mat-card>
  `,
})
export class AfiliadosListComponent implements OnInit {
  private api = inject(AfiliadosApiService);
  protected cols = ["rut", "nombre", "email", "vigencia"];
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

  onPage(ev: PageEvent) {
    this.page.set(ev.pageIndex + 1);
    this.pageSize.set(ev.pageSize);
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
