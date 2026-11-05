import { descargarArchivo } from "../../shared/descarga";
import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { TableModule } from "primeng/table";
import { ProgressBarModule } from "primeng/progressbar";
import { MessageService } from "primeng/api";
import { CargasMasivasApiService } from "../../core/services/cargas-masivas.service";
import { PlanesApiService } from "../../core/services/planes.service";
import { PLANES_SIN_COBERTURA } from "@legalmene/shared";
import type { CargaMasivaResultado, EntidadCargaMasiva, TipoCargaMasiva } from "@legalmene/shared";

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
  ],
  template: `
    <p-card>
      <ng-template pTemplate="header">
        <div style="padding:16px 16px 0;">
          <h2 style="margin:0;">Cargas masivas</h2>
          <small class="lm-muted">
            Nómina, cargas (familiares) o bienes de un plan. FLUJO agrega y actualiza · STOCK además termina
            lo del plan que no viene en el archivo (Anexo §III). Al terminar se avisa en la aplicación a quienes ejecutan cargas.
          </small>
        </div>
      </ng-template>

      <div class="lm-row" style="margin-bottom:16px;">
        <p-select
          [(ngModel)]="entidad"
          [options]="entidadOpts"
          optionLabel="label"
          optionValue="value"
          [style]="{ 'min-width': '180px' }"
          (onChange)="resultado.set(null)"
        ></p-select>
        <p-select
          [(ngModel)]="codPlan"
          [options]="planOpts()"
          optionLabel="label"
          optionValue="value"
          placeholder="Plan"
          [style]="{ 'min-width': '240px' }"
        ></p-select>
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

        <button pButton icon="pi pi-cloud-upload" label="Procesar carga" (click)="subir()" [disabled]="!file() || !codPlan || cargando()"></button>
      </div>

      <p-progressBar *ngIf="cargando()" mode="indeterminate" [style]="{ height: '4px' }"></p-progressBar>

      <details style="margin-top:16px;">
        <summary style="cursor:pointer; opacity:0.7;">Formato CSV esperado</summary>
        <pre *ngIf="entidad === 'cargas'" style="background:#f5f5f5; padding:8px; border-radius:4px; margin-top:8px;">rut_titular,rut,nombres,apellido_paterno,apellido_materno,parentesco,fecha_nacimiento,fecha_inicio,fecha_termino
11111111-1,33333333-3,Ana,Pérez,Soto,Hijo,2010-05-02,2026-01-01,</pre>
        <pre *ngIf="entidad === 'bienes'" style="background:#f5f5f5; padding:8px; border-radius:4px; margin-top:8px;">rut_titular,tipo,identificador,descripcion,comuna,fecha_inicio,fecha_termino
11111111-1,Vehiculo,ABCD12,Auto familiar,Santiago,2026-01-01,
11111111-1,Inmueble,123-45,Casa habitación,Ñuñoa,,</pre>
        <small *ngIf="entidad !== 'afiliados'" class="lm-muted">
          El titular debe estar en la nómina del plan. Parentesco: Conyuge, ConvivienteCivil, Hijo, Padre, Madre u Otro. Tipo de bien: Inmueble, Vehiculo u Otro.
        </small>
        <pre *ngIf="entidad === 'afiliados'" style="background:#f5f5f5; padding:8px; border-radius:4px; margin-top:8px;">rut,nombres,apellido_paterno,apellido_materno,email,telefono,comuna,region,fecha_nacimiento,fecha_inicio,fecha_termino
11111111-1,Juan,Pérez,Soto,juan&#64;ejemplo.cl,+56912345678,Santiago,RM,1985-04-12,2026-01-01,2026-12-31
22222222-2,María,González,,maria&#64;ejemplo.cl,,,,,,</pre>
        <small *ngIf="entidad === 'afiliados'" class="lm-muted">
          Si el RUT ya existe no se modifican sus datos personales. Sin fecha_inicio se usa la fecha de hoy.
        </small>
      </details>

      <div *ngIf="resultado() as r" style="margin-top:24px;">
        <div class="lm-row"><h3 style="flex:1;">Resultado</h3>
          <button pButton icon="pi pi-file-excel" label="Descargar reporte" [outlined]="true" size="small" (click)="reporte(r)"></button></div>
        <div class="lm-grid lm-grid-4" style="margin-bottom:16px;">
          <p-card><div style="font-size:20px; font-weight:600;">{{ r.totalRegistros }}</div><small>Total filas</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600; color:#388e3c;">{{ r.insertados }}</div><small>Nuevos en el plan</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600; color:#1976d2;">{{ r.actualizados }}</div><small>Vigencias actualizadas</small></p-card>
          <p-card><div style="font-size:20px; font-weight:600; color:#7b1fa2;">{{ r.eliminados }}</div><small>Terminados (STOCK)</small></p-card>
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
export class CargasMasivasComponent implements OnInit {
  private api = inject(CargasMasivasApiService);
  private planesApi = inject(PlanesApiService);
  private msg = inject(MessageService);

  protected tipo: TipoCargaMasiva = "FLUJO";
  protected entidad: EntidadCargaMasiva = "afiliados";
  protected entidadOpts = [
    { label: "Nómina (afiliados)", value: "afiliados" },
    { label: "Cargas", value: "cargas" },
    { label: "Bienes", value: "bienes" },
  ];
  protected codPlan: string | null = null;
  protected planOpts = signal<{ label: string; value: string }[]>([]);
  protected file = signal<File | null>(null);
  protected cargando = signal(false);
  protected resultado = signal<CargaMasivaResultado | null>(null);

  protected tipoOpts = [
    { label: "FLUJO (upsert)", value: "FLUJO" },
    { label: "STOCK (reemplazar padrón)", value: "STOCK" },
  ];

  ngOnInit() {
    const especiales = PLANES_SIN_COBERTURA as readonly string[];
    this.planesApi.listar().subscribe((ps) => {
      const cargables = ps.filter((p) => p.vigente && !especiales.includes(p.codPlan));
      this.planOpts.set(cargables.map((p) => ({ label: `${p.codPlan} — ${p.nombre}`, value: p.codPlan })));
      this.codPlan ??= cargables[0]?.codPlan ?? null;
    });
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  subir() {
    const f = this.file();
    if (!f || !this.codPlan) return;
    this.cargando.set(true);
    this.resultado.set(null);
    this.api.cargar(this.entidad, this.codPlan, this.tipo, f).subscribe({
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

  async reporte(r: CargaMasivaResultado) {
    try {
      await descargarArchivo("/cargas-masivas/resumen.xlsx", `carga-${r.entidad}-${r.codPlan}.xlsx`, { body: r });
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo descargar", detail: (e as Error).message, life: 6000 });
    }
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }
}
