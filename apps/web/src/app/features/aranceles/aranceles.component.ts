import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { ArancelesApiService } from "../../core/services/aranceles.service";
import { MeService } from "../../core/services/me.service";
import type { ArancelConValor, Competencia, TipoAtencion, ValorUf } from "@legalmene/shared";

const COMPETENCIAS: Competencia[] = [
  "Civil", "Penal", "Laboral", "Familia", "Tributario", "Comercial", "Administrativo", "Constitucional", "Otro",
];
const TIPOS: TipoAtencion[] = ["Consulta", "Asesoria", "Juicio"];

@Component({
  selector: "lm-aranceles",
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, CardModule, InputTextModule, InputNumberModule,
    SelectModule, ButtonModule, TableModule, TagModule,
  ],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Aranceles</h1>
        <small class="lm-muted">Matriz de aranceles del plan, en UF con su equivalente en pesos</small>
      </div>
      <div class="lm-muted lm-small" *ngIf="uf() as u; else sinUf">
        UF {{ u.fecha | date: 'dd/MM/yyyy' }}: <strong>$ {{ u.valorCentavos / 100 | number: '1.2-2' }}</strong>
      </div>
      <ng-template #sinUf><span class="lm-small" style="color:#b45309;">Sin valor UF cargado: no se muestran pesos</span></ng-template>
    </div>

    <p-card *ngIf="puedeEditar()" [style]="{ 'margin-bottom': '16px', display: 'block' }">
      <form [formGroup]="form" (ngSubmit)="crear()" class="lm-row" style="flex-wrap:wrap;">
        <input pInputText formControlName="codigo" placeholder="Código (A-LAB-01)" style="width:150px;" />
        <input pInputText formControlName="descripcion" placeholder="Descripción" class="lm-grow" style="min-width:220px;" />
        <p-select formControlName="competencia" [options]="competencias" placeholder="Competencia" appendTo="body" [style]="{ width: '170px' }"></p-select>
        <p-select formControlName="tipo" [options]="tipos" placeholder="Tipo (opcional)" [showClear]="true" appendTo="body" [style]="{ width: '160px' }"></p-select>
        <p-inputNumber formControlName="valorUf" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0.01" placeholder="Valor UF" [inputStyle]="{ width: '110px' }"></p-inputNumber>
        <button pButton type="submit" label="Agregar" icon="pi pi-plus" [disabled]="form.invalid || guardando()"></button>
      </form>
    </p-card>

    <p-card>
      <p-table [value]="data()" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Código</th><th>Descripción</th><th>Competencia</th><th>Tipo</th>
            <th style="text-align:right;">UF</th><th style="text-align:right;">Pesos</th><th>Estado</th>
            <th *ngIf="puedeEditar()"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr>
            <td class="lm-mono">{{ a.codigo }}</td>
            <td>{{ a.descripcion }}</td>
            <td>{{ a.competencia }}</td>
            <td>{{ a.tipo ?? '—' }}</td>
            <td style="text-align:right;">{{ a.valorUfCentesimas / 100 | number: '1.0-2' }}</td>
            <td style="text-align:right;">{{ a.valorClp !== null ? ('$ ' + (a.valorClp | number)) : '—' }}</td>
            <td><p-tag [value]="a.vigente ? 'Vigente' : 'No vigente'" [severity]="a.vigente ? 'success' : 'secondary'"></p-tag></td>
            <td *ngIf="puedeEditar()" style="text-align:right;">
              <button pButton type="button" class="p-button-text p-button-sm" [label]="a.vigente ? 'Desactivar' : 'Activar'" (click)="toggleVigente(a)"></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" style="text-align:center; padding:24px;" class="lm-muted">Sin aranceles en este plan.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class ArancelesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ArancelesApiService);
  private me = inject(MeService);
  private msg = inject(MessageService);

  protected data = signal<ArancelConValor[]>([]);
  protected uf = signal<ValorUf | null>(null);
  protected loading = signal(false);
  protected guardando = signal(false);
  protected competencias = COMPETENCIAS;
  protected tipos = TIPOS;
  protected puedeEditar = computed(() => ["Administrador", "Supervisor"].includes(this.me.user()?.rol ?? ""));

  protected form = this.fb.group({
    codigo: ["", [Validators.required, Validators.maxLength(30)]],
    descripcion: ["", [Validators.required, Validators.maxLength(250)]],
    competencia: [null as Competencia | null, Validators.required],
    tipo: [null as TipoAtencion | null],
    valorUf: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api.listar().subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.uf.set(res.uf);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  crear() {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.guardando.set(true);
    this.api
      .crear({
        codigo: v.codigo!.trim(),
        descripcion: v.descripcion!.trim(),
        competencia: v.competencia!,
        tipo: v.tipo ?? null,
        valorUfCentesimas: Math.round(v.valorUf! * 100),
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.form.reset();
          this.msg.add({ severity: "success", summary: "Arancel creado", life: 2500 });
          this.recargar();
        },
        error: (err) => {
          this.guardando.set(false);
          this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 });
        },
      });
  }

  toggleVigente(a: ArancelConValor) {
    this.api.actualizar(a.id, { vigente: !a.vigente }).subscribe({
      next: () => this.recargar(),
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }
}
