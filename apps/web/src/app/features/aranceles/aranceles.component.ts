import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { ArancelesApiService } from "../../core/services/aranceles.service";
import { MaestrosApiService } from "../../core/services/maestros.service";
import { MeService } from "../../core/services/me.service";
import type { ArancelConValor, Competencia, Materia, TipoAtencion, ValorUf } from "@legalmene/shared";

const TIPOS: { label: string; value: TipoAtencion }[] = [
  { label: "Consulta", value: "Consulta" },
  { label: "Asesoría", value: "Asesoria" },
  { label: "Juicio", value: "Juicio" },
];

@Component({
  selector: "lm-aranceles",
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterLink, CardModule, InputTextModule, InputNumberModule,
    SelectModule, ButtonModule, TableModule, TagModule,
  ],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Aranceles</h1>
        <small class="lm-muted">Valor de cada materia en UF, común a todos los planes. El copago depende de la
          <a routerLink="/admin/coberturas">cobertura del plan</a>.</small>
      </div>
      <div class="lm-muted lm-small" *ngIf="uf() as u; else sinUf">
        UF {{ u.fecha | date: 'dd/MM/yyyy' }}: <strong>$ {{ u.valorCentavos / 100 | number: '1.2-2' }}</strong>
      </div>
      <ng-template #sinUf><span class="lm-small" style="color:#b45309;">Sin valor UF cargado: no se muestran pesos</span></ng-template>
    </div>

    <p-card *ngIf="puedeEditar()" [style]="{ 'margin-bottom': '16px', display: 'block' }">
      <form [formGroup]="form" (ngSubmit)="crear()" class="lm-row" style="flex-wrap:wrap;">
        <p-select formControlName="competenciaId" [options]="competencias()" optionLabel="nombre" optionValue="id" placeholder="Competencia"
          appendTo="body" [style]="{ width: '170px' }" (onChange)="cargarMaterias($event.value)"></p-select>
        <p-select formControlName="materiaId" [options]="materiasForm()" optionLabel="nombre" optionValue="id" placeholder="Materia"
          [filter]="true" filterBy="nombre" appendTo="body" [style]="{ width: '220px' }"></p-select>
        <p-select formControlName="tipo" [options]="tipos" optionLabel="label" optionValue="value" placeholder="Cualquier tipo"
          [showClear]="true" appendTo="body" [style]="{ width: '160px' }"></p-select>
        <input pInputText formControlName="codigo" placeholder="Código (A-LAB-01)" style="width:140px;" />
        <input pInputText formControlName="descripcion" placeholder="Descripción" class="lm-grow" style="min-width:200px;" />
        <p-inputNumber formControlName="valorUf" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0.01" placeholder="Valor UF" [inputStyle]="{ width: '110px' }"></p-inputNumber>
        <button pButton type="submit" label="Agregar" icon="pi pi-plus" [disabled]="form.invalid || guardando()"></button>
      </form>
    </p-card>

    <p-card>
      <div class="lm-row" style="margin-bottom:12px;">
        <p-select [(ngModel)]="filtroCompetencia" [options]="competencias()" optionLabel="nombre" optionValue="id"
          placeholder="Todas las competencias" [showClear]="true" [style]="{ width: '240px' }" (onChange)="recargar()"></p-select>
      </div>
      <p-table [value]="data()" [loading]="loading()" styleClass="p-datatable-sm" rowGroupMode="subheader" groupRowsBy="competenciaNombre">
        <ng-template pTemplate="header">
          <tr>
            <th>Código</th><th>Materia</th><th>Descripción</th><th>Tipo</th>
            <th style="text-align:right;">UF</th><th style="text-align:right;">Pesos</th><th>Estado</th>
            <th *ngIf="puedeEditar()"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="groupheader" let-a>
          <tr><td [attr.colspan]="puedeEditar() ? 8 : 7" style="background:#f8fafc; font-weight:600;">{{ a.competenciaNombre }}</td></tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr>
            <td class="lm-mono" style="white-space:nowrap;">{{ a.codigo }}</td>
            <td>{{ a.materiaNombre }}</td>
            <td>{{ a.descripcion }}</td>
            <td>{{ tipoLabel(a.tipo) }}</td>
            <td style="text-align:right;">{{ a.valorUfCentesimas / 100 | number: '1.0-2' }}</td>
            <td style="text-align:right; white-space:nowrap;">{{ a.valorClp !== null ? ('$ ' + (a.valorClp | number)) : '—' }}</td>
            <td><p-tag [value]="a.vigente ? 'Vigente' : 'No vigente'" [severity]="a.vigente ? 'success' : 'secondary'"></p-tag></td>
            <td *ngIf="puedeEditar()" style="text-align:right;">
              <button pButton type="button" class="p-button-text p-button-sm" [label]="a.vigente ? 'Desactivar' : 'Activar'" (click)="toggleVigente(a)"></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" style="text-align:center; padding:24px;" class="lm-muted">Sin aranceles.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class ArancelesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ArancelesApiService);
  private maestros = inject(MaestrosApiService);
  private me = inject(MeService);
  private msg = inject(MessageService);

  protected data = signal<ArancelConValor[]>([]);
  protected uf = signal<ValorUf | null>(null);
  protected competencias = signal<Competencia[]>([]);
  protected materiasForm = signal<Materia[]>([]);
  protected loading = signal(false);
  protected guardando = signal(false);
  protected tipos = TIPOS;
  protected filtroCompetencia: string | undefined;
  protected puedeEditar = computed(() => ["Administrador", "Supervisor"].includes(this.me.user()?.rol ?? ""));

  protected form = this.fb.group({
    competenciaId: ["", Validators.required],
    materiaId: ["", Validators.required],
    tipo: [null as TipoAtencion | null],
    codigo: ["", [Validators.required, Validators.maxLength(30)]],
    descripcion: ["", [Validators.required, Validators.maxLength(250)]],
    valorUf: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  ngOnInit() {
    this.maestros.listar("competencias", { vigente: true }).subscribe((c) => this.competencias.set(c));
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api.listar({ competenciaId: this.filtroCompetencia }).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.uf.set(res.uf);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  cargarMaterias(competenciaId: string | null) {
    this.form.patchValue({ materiaId: "" });
    if (!competenciaId) {
      this.materiasForm.set([]);
      return;
    }
    this.maestros.listar("materias", { competenciaId, vigente: true }).subscribe((m) => this.materiasForm.set(m));
  }

  crear() {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.guardando.set(true);
    this.api
      .crear({
        materiaId: v.materiaId!,
        tipo: v.tipo ?? null,
        codigo: v.codigo!.trim(),
        descripcion: v.descripcion!.trim(),
        valorUfCentesimas: Math.round(v.valorUf! * 100),
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.form.reset({ competenciaId: v.competenciaId, materiaId: "", tipo: null });
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

  tipoLabel(t: TipoAtencion | null): string {
    return t ? (TIPOS.find((x) => x.value === t)?.label ?? t) : "Cualquiera";
  }
}
