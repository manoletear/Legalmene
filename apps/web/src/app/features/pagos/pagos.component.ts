import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { MatChipsModule } from "@angular/material/chips";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { PagosApiService } from "../../core/services/pagos.service";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import type { Afiliado, Pago } from "@legalmene/shared";

@Component({
  selector: "lm-pagos",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatPaginatorModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card style="margin-bottom:16px;">
      <mat-card-header>
        <mat-card-title>Iniciar pago WebPay</mat-card-title>
        <mat-card-subtitle>Demo (stub Transbank); orden de compra generada localmente</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="iniciar()" style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start;">
          <mat-form-field appearance="outline" style="min-width:280px; flex:1;">
            <mat-label>Afiliado</mat-label>
            <mat-select formControlName="afiliadoId">
              <mat-option *ngFor="let a of afiliados()" [value]="a.id">
                {{ a.rut }} — {{ a.apellidoPaterno }}, {{ a.nombres }}
              </mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="min-width:160px;">
            <mat-label>Monto (CLP)</mat-label>
            <input matInput type="number" formControlName="monto" />
          </mat-form-field>
          <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || iniciando()">
            Iniciar pago
          </button>
        </form>
      </mat-card-content>
    </mat-card>

    <mat-card>
      <mat-card-header>
        <mat-card-title>Historial</mat-card-title>
        <span style="flex:1"></span>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:160px;">
          <mat-label>Estado</mat-label>
          <mat-select [value]="filtroEstado" (selectionChange)="setEstado($event.value)">
            <mat-option [value]="undefined">Todos</mat-option>
            <mat-option value="Iniciado">Iniciado</mat-option>
            <mat-option value="Autorizado">Autorizado</mat-option>
            <mat-option value="Rechazado">Rechazado</mat-option>
            <mat-option value="Anulado">Anulado</mat-option>
            <mat-option value="Reembolsado">Reembolsado</mat-option>
          </mat-select>
        </mat-form-field>
      </mat-card-header>
      <mat-card-content>
        <table mat-table [dataSource]="data()" *ngIf="data().length; else vacio">
          <ng-container matColumnDef="ordenCompra">
            <th mat-header-cell *matHeaderCellDef>Orden</th>
            <td mat-cell *matCellDef="let p">{{ p.ordenCompra }}</td>
          </ng-container>
          <ng-container matColumnDef="monto">
            <th mat-header-cell *matHeaderCellDef>Monto</th>
            <td mat-cell *matCellDef="let p">{{ p.monto | currency: p.moneda : 'symbol-narrow' : '1.0-0' }}</td>
          </ng-container>
          <ng-container matColumnDef="estado">
            <th mat-header-cell *matHeaderCellDef>Estado</th>
            <td mat-cell *matCellDef="let p"><mat-chip [color]="estadoColor(p.estado)" highlighted>{{ p.estado }}</mat-chip></td>
          </ng-container>
          <ng-container matColumnDef="proveedor">
            <th mat-header-cell *matHeaderCellDef>Proveedor</th>
            <td mat-cell *matCellDef="let p">{{ p.proveedor }}</td>
          </ng-container>
          <ng-container matColumnDef="fecha">
            <th mat-header-cell *matHeaderCellDef>Iniciado</th>
            <td mat-cell *matCellDef="let p">{{ p.fechaIniciado | date: 'short' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>
        <ng-template #vacio>
          <p *ngIf="!loading()" style="opacity:0.5;">Sin pagos.</p>
        </ng-template>
        <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageSizeOptions]="[25, 50]" (page)="onPage($event)" />
      </mat-card-content>
    </mat-card>
  `,
})
export class PagosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(PagosApiService);
  private afiliadosApi = inject(AfiliadosApiService);
  private snack = inject(MatSnackBar);

  protected cols = ["ordenCompra", "monto", "estado", "proveedor", "fecha"];
  protected data = signal<Pago[]>([]);
  protected afiliados = signal<Afiliado[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected iniciando = signal(false);
  protected filtroEstado: string | undefined;

  protected form = this.fb.group({
    afiliadoId: ["", Validators.required],
    monto: [10000, [Validators.required, Validators.min(1)]],
  });

  ngOnInit() {
    this.afiliadosApi.buscar({ pageSize: 200 }).subscribe((res) => this.afiliados.set(res.data));
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api.listar({ page: this.page(), pageSize: this.pageSize(), estado: this.filtroEstado }).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setEstado(e: string | undefined) {
    this.filtroEstado = e;
    this.page.set(1);
    this.recargar();
  }

  onPage(ev: PageEvent) {
    this.page.set(ev.pageIndex + 1);
    this.pageSize.set(ev.pageSize);
    this.recargar();
  }

  iniciar() {
    if (this.form.invalid) return;
    this.iniciando.set(true);
    const v = this.form.value;
    this.api
      .iniciar({
        afiliadoId: v.afiliadoId!,
        monto: v.monto!,
        returnUrl: `${window.location.origin}/pagos/return`,
      })
      .subscribe({
        next: (res) => {
          this.iniciando.set(false);
          this.snack.open(`Pago iniciado: ${res.pago.ordenCompra}`, "OK", { duration: 3000 });
          this.recargar();
        },
        error: (err) => {
          this.iniciando.set(false);
          this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 4000 });
        },
      });
  }

  estadoColor(e: string) {
    if (e === "Autorizado") return "primary";
    if (e === "Rechazado" || e === "Anulado") return "warn";
    return "accent";
  }
}
