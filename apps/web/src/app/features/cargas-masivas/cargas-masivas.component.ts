import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatTableModule } from "@angular/material/table";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { CargasMasivasApiService } from "../../core/services/cargas-masivas.service";
import type { CargaMasivaResultado, TipoCargaMasiva } from "@legalmene/shared";

@Component({
  selector: "lm-cargas-masivas",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatSnackBarModule,
    MatProgressBarModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Cargas masivas de afiliados</mat-card-title>
        <mat-card-subtitle>
          FLUJO = upsert sin eliminar · STOCK = reemplaza padrón completo (Anexo 03.2)
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:16px; flex-wrap:wrap;">
          <mat-form-field appearance="outline" style="min-width:160px">
            <mat-label>Tipo</mat-label>
            <mat-select [(ngModel)]="tipo">
              <mat-option value="FLUJO">FLUJO (upsert)</mat-option>
              <mat-option value="STOCK">STOCK (reemplazar padrón)</mat-option>
            </mat-select>
          </mat-form-field>

          <div style="display:flex; align-items:center; gap:12px; padding-top:6px;">
            <input #fileInput type="file" accept=".csv,text/csv" (change)="onFile($event)" style="display:none" />
            <button mat-stroked-button (click)="fileInput.click()">
              <mat-icon>attach_file</mat-icon> Seleccionar CSV
            </button>
            <span *ngIf="file()" style="opacity:0.8;">{{ file()!.name }} ({{ formatBytes(file()!.size) }})</span>
          </div>

          <button mat-flat-button color="primary" (click)="subir()" [disabled]="!file() || cargando()">
            <mat-icon>cloud_upload</mat-icon> Procesar carga
          </button>
        </div>

        <mat-progress-bar *ngIf="cargando()" mode="indeterminate"></mat-progress-bar>

        <details style="margin-top:16px;">
          <summary style="cursor:pointer; opacity:0.7;">Formato CSV esperado</summary>
          <pre style="background:#f5f5f5; padding:8px; border-radius:4px; margin-top:8px;">rut,nombres,apellido_paterno,apellido_materno,email,telefono,comuna,region,fecha_nacimiento
11111111-1,Juan,Pérez,Soto,juan&#64;ejemplo.cl,+56912345678,Santiago,RM,1985-04-12
22222222-2,María,González,,maria&#64;ejemplo.cl,,,,</pre>
        </details>

        <div *ngIf="resultado() as r" style="margin-top:24px;">
          <h3>Resultado</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;">
            <mat-card><mat-card-content>
              <div style="font-size:20px; font-weight:600;">{{ r.totalRegistros }}</div>
              <small>Total filas</small>
            </mat-card-content></mat-card>
            <mat-card><mat-card-content>
              <div style="font-size:20px; font-weight:600; color:#388e3c;">{{ r.insertados }}</div>
              <small>Insertados</small>
            </mat-card-content></mat-card>
            <mat-card><mat-card-content>
              <div style="font-size:20px; font-weight:600; color:#1976d2;">{{ r.actualizados }}</div>
              <small>Actualizados</small>
            </mat-card-content></mat-card>
            <mat-card><mat-card-content>
              <div style="font-size:20px; font-weight:600; color:#7b1fa2;">{{ r.eliminados }}</div>
              <small>Eliminados (STOCK)</small>
            </mat-card-content></mat-card>
            <mat-card><mat-card-content>
              <div style="font-size:20px; font-weight:600;" [style.color]="r.errores.length ? '#d32f2f' : undefined">{{ r.errores.length }}</div>
              <small>Errores</small>
            </mat-card-content></mat-card>
            <mat-card><mat-card-content>
              <div style="font-size:20px; font-weight:600;">{{ r.duracionMs }} ms</div>
              <small>Duración</small>
            </mat-card-content></mat-card>
          </div>

          <ng-container *ngIf="r.errores.length">
            <h4>Errores</h4>
            <table mat-table [dataSource]="r.errores" style="width:100%;">
              <ng-container matColumnDef="fila">
                <th mat-header-cell *matHeaderCellDef>Fila</th>
                <td mat-cell *matCellDef="let e">{{ e.fila }}</td>
              </ng-container>
              <ng-container matColumnDef="mensaje">
                <th mat-header-cell *matHeaderCellDef>Mensaje</th>
                <td mat-cell *matCellDef="let e">{{ e.mensaje }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['fila','mensaje']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['fila','mensaje']"></tr>
            </table>
          </ng-container>
        </div>
      </mat-card-content>
    </mat-card>
  `,
})
export class CargasMasivasComponent {
  private api = inject(CargasMasivasApiService);
  private snack = inject(MatSnackBar);

  protected tipo: TipoCargaMasiva = "FLUJO";
  protected file = signal<File | null>(null);
  protected cargando = signal(false);
  protected resultado = signal<CargaMasivaResultado | null>(null);

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  subir() {
    const f = this.file();
    if (!f) return;
    this.cargando.set(true);
    this.resultado.set(null);
    this.api.cargarAfiliados(this.tipo, f).subscribe({
      next: (r) => {
        this.resultado.set(r);
        this.cargando.set(false);
        const msg = `${r.insertados} ins · ${r.actualizados} upd · ${r.eliminados} del · ${r.errores.length} err`;
        this.snack.open(msg, "OK", { duration: 4000 });
      },
      error: (err) => {
        this.cargando.set(false);
        this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 5000 });
      },
    });
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }
}
