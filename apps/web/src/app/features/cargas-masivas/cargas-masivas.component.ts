import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { TableModule } from "primeng/table";
import { ProgressBarModule } from "primeng/progressbar";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { CargasMasivasApiService } from "../../core/services/cargas-masivas.service";
import type { CargaMasivaResultado, TipoCargaMasiva } from "@legalmene/shared";

@Component({
  selector: "lm-cargas-masivas",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    SelectModule,
    TableModule,
    ProgressBarModule,
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
    <p-card>
      <ng-template pTemplate="header">
        <div style="padding:16px 16px 0;">
          <h2 style="margin:0;">Cargas masivas de afiliados</h2>
          <small class="lm-muted">FLUJO = upsert sin eliminar · STOCK = reemplaza padrón completo (Anexo 03.2)</small>
        </div>
      </ng-template>

      <div class="lm-row" style="margin-bottom:16px;">
        <p-select
          [(ngModel)]="tipo"
          [options]="tipoOpts"
          optionLabel="label"
          optionValue="value"
          [style]="{ 'min-width': '220px' }"
        ></p-select>

        <input #fileInput type="file" accept=".csv,text/csv" (change)="onFile($event)" style="display:none" />
        <button pButton [outlined]="true" icon="pi pi-paperclip" label="Seleccionar CSV" (click)="fileInput.click()"></button>
        <span *ngIf="file()" class="lm-muted">{{ file()!.name }} ({{ formatBytes(file()!.size) }})</span>

        <button pButton icon="pi pi-cloud-upload" label="Procesar carga" (click)="subir()" [disabled]="!file() || cargando()"></button>
      </div>

      <p-progressBar *ngIf="cargando()" mode="indeterminate" [style]="{ height: '4px' }"></p-progressBar>

      <details style="margin-top:16px;">
        <summary style="cursor:pointer; opacity:0.7;">Formato CSV esperado</summary>
        <pre style="background:#f5f5f5; padding:8px; border-radius:4px; margin-top:8px;">rut,nombres,apellido_paterno,apellido_materno,email,telefono,comuna,region,fecha_nacimiento
11111111-1,Juan,Pérez,Soto,juan&#64;ejemplo.cl,+56912345678,Santiago,RM,1985-04-12
22222222-2,María,González,,maria&#64;ejemplo.cl,,,,</pre>
      </details>

      <div *ngIf="resultado() as r" style="margin-top:24px;">
        <h3>Resultado</h3>
        <div class="lm-grid lm-grid-4" style="margin-bottom:16px;">
          <p-card><div style="font-size:20px; font-weight:600;">{{ r.totalRegistros }}</div><small>Total filas</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600; color:#388e3c;">{{ r.insertados }}</div><small>Insertados</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600; color:#1976d2;">{{ r.actualizados }}</div><small>Actualizados</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600; color:#7b1fa2;">{{ r.eliminados }}</div><small>Eliminados (STOCK)</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600;" [style.color]="r.errores.length ? '#d32f2f' : undefined">{{ r.errores.length }}</div><small>Errores</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600;">{{ r.duracionMs }} ms</div><small>Duración</small></p-card>
        </div>

        <ng-container *ngIf="r.errores.length">
          <h4>Errores</h4>
          <p-table [value]="r.errores" styleClass="p-datatable-sm">
            <ng-template pTemplate="header">
              <tr><th style="width:80px;">Fila</th><th>Mensaje</th></tr>
            </ng-template>
            <ng-template pTemplate="body" let-e>
              <tr><td>{{ e.fila }}</td><td>{{ e.mensaje }}</td></tr>
            </ng-template>
          </p-table>
        </ng-container>
      </div>
    </p-card>
  `,
})
export class CargasMasivasComponent {
  private api = inject(CargasMasivasApiService);
  private msg = inject(MessageService);

  protected tipo: TipoCargaMasiva = "FLUJO";
  protected file = signal<File | null>(null);
  protected cargando = signal(false);
  protected resultado = signal<CargaMasivaResultado | null>(null);

  protected tipoOpts = [
    { label: "FLUJO (upsert)", value: "FLUJO" },
    { label: "STOCK (reemplazar padrón)", value: "STOCK" },
  ];

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
        const detail = `${r.insertados} ins · ${r.actualizados} upd · ${r.eliminados} del · ${r.errores.length} err`;
        this.msg.add({ severity: "success", summary: "Carga procesada", detail, life: 4000 });
      },
      error: (err) => {
        this.cargando.set(false);
        this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 5000 });
      },
    });
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }
}
