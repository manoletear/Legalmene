import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { CardModule } from "primeng/card";
import { InputNumberModule } from "primeng/inputnumber";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { CoberturasApiService } from "../../core/services/coberturas.service";
import { MaestrosApiService } from "../../core/services/maestros.service";
import { PlanesApiService } from "../../core/services/planes.service";
import { MeService } from "../../core/services/me.service";
import type {
  CoberturaConMaestros,
  Competencia,
  CopagoResultado,
  Materia,
  ModalidadCobertura,
  Plan,
  TipoAtencion,
} from "@legalmene/shared";

const TIPOS: { label: string; value: TipoAtencion }[] = [
  { label: "Consulta", value: "Consulta" },
  { label: "Asesoría", value: "Asesoria" },
  { label: "Juicio", value: "Juicio" },
];
const MODALIDADES: { label: string; value: ModalidadCobertura }[] = [
  { label: "% del arancel", value: "Porcentaje" },
  { label: "Precio fijo en UF", value: "ValorUF" },
  { label: "Sin cobertura", value: "SinCobertura" },
];

interface FormCobertura {
  competenciaId: string | null;
  materiaId: string | null;
  tipo: TipoAtencion | null;
  modalidad: ModalidadCobertura;
  porcentaje: number | null;
  valorUf: number | null;
}

const vacio = (): FormCobertura => ({
  competenciaId: null,
  materiaId: null,
  tipo: null,
  modalidad: "Porcentaje",
  porcentaje: null,
  valorUf: null,
});

@Component({
  selector: "lm-admin-coberturas",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, InputNumberModule, SelectModule, ButtonModule, TableModule, TagModule],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Coberturas por plan</h1>
        <small class="lm-muted">Qué parte del arancel cubre cada plan. Se aplica la regla más específica:
          materia y tipo → materia → tipo → regla general del plan. Sin regla, el afiliado paga el arancel completo.</small>
      </div>
      <p-select [(ngModel)]="codPlan" [options]="planes()" optionLabel="nombre" optionValue="codPlan" placeholder="Selecciona plan"
        [filter]="true" filterBy="nombre,codPlan" [style]="{ width: '280px' }" (onChange)="recargar()"></p-select>
    </div>

    <ng-container *ngIf="codPlan">
      <p-card *ngIf="puedeEditar()" [style]="{ display: 'block', 'margin-bottom': '16px' }">
        <form (ngSubmit)="guardar()" class="lm-row" style="flex-wrap:wrap; align-items:center;">
          <p-select [(ngModel)]="form.competenciaId" name="competencia" [options]="competencias()" optionLabel="nombre" optionValue="id"
            placeholder="Todas las materias" [showClear]="true" appendTo="body" [style]="{ width: '190px' }"
            (onChange)="cargarMaterias($event.value)" [disabled]="!!editandoId()"></p-select>
          <p-select [(ngModel)]="form.materiaId" name="materia" [options]="materias()" optionLabel="nombre" optionValue="id"
            [placeholder]="form.competenciaId ? 'Materia' : '—'" [showClear]="true" appendTo="body" [style]="{ width: '220px' }"
            [disabled]="!form.competenciaId || !!editandoId()"></p-select>
          <p-select [(ngModel)]="form.tipo" name="tipo" [options]="tipos" optionLabel="label" optionValue="value"
            placeholder="Cualquier tipo" [showClear]="true" appendTo="body" [style]="{ width: '160px' }" [disabled]="!!editandoId()"></p-select>
          <p-select [(ngModel)]="form.modalidad" name="modalidad" [options]="modalidades" optionLabel="label" optionValue="value"
            appendTo="body" [style]="{ width: '180px' }"></p-select>
          <p-inputNumber *ngIf="form.modalidad === 'Porcentaje'" [(ngModel)]="form.porcentaje" name="porcentaje" [min]="0" [max]="100"
            suffix=" %" placeholder="% cubierto" [inputStyle]="{ width: '110px' }"></p-inputNumber>
          <p-inputNumber *ngIf="form.modalidad === 'ValorUF'" [(ngModel)]="form.valorUf" name="valorUf" mode="decimal"
            [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" UF" placeholder="Precio" [inputStyle]="{ width: '110px' }"></p-inputNumber>
          <button pButton type="submit" [label]="editandoId() ? 'Guardar cambios' : 'Agregar regla'" [disabled]="!valido()"></button>
          <button *ngIf="editandoId()" pButton type="button" label="Cancelar" [text]="true" severity="secondary" (click)="limpiar()"></button>
        </form>
      </p-card>

      <p-card>
        <p-table [value]="reglas()" [loading]="loading()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr><th>Materia</th><th>Tipo</th><th>Cobertura</th><th>Estado</th><th *ngIf="puedeEditar()"></th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td>{{ r.materiaNombre ? r.competenciaNombre + ' · ' + r.materiaNombre : 'Todas (regla general)' }}</td>
              <td>{{ tipoLabel(r.tipo) }}</td>
              <td>{{ describir(r) }}</td>
              <td><p-tag [value]="r.vigente ? 'Vigente' : 'No vigente'" [severity]="r.vigente ? 'success' : 'secondary'"></p-tag></td>
              <td *ngIf="puedeEditar()" style="text-align:right; white-space:nowrap;">
                <button pButton type="button" class="p-button-text p-button-sm" label="Editar" (click)="editar(r)"></button>
                <button pButton type="button" class="p-button-text p-button-sm" [label]="r.vigente ? 'Desactivar' : 'Activar'" (click)="toggle(r)"></button>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5" style="text-align:center; padding:24px;" class="lm-muted">El plan no tiene reglas: sus afiliados pagan el arancel completo.</td></tr>
          </ng-template>
        </p-table>
      </p-card>

      <p-card [style]="{ display: 'block', 'margin-top': '16px' }" header="Simular copago">
        <div class="lm-row" style="flex-wrap:wrap; align-items:center;">
          <p-select [(ngModel)]="sim.competenciaId" [options]="competencias()" optionLabel="nombre" optionValue="id" placeholder="Competencia"
            appendTo="body" [style]="{ width: '190px' }" (onChange)="cargarMateriasSim($event.value)"></p-select>
          <p-select [(ngModel)]="sim.materiaId" [options]="materiasSim()" optionLabel="nombre" optionValue="id" placeholder="Materia"
            appendTo="body" [style]="{ width: '220px' }" (onChange)="simular()"></p-select>
          <p-select [(ngModel)]="sim.tipo" [options]="tipos" optionLabel="label" optionValue="value" appendTo="body"
            [style]="{ width: '160px' }" (onChange)="simular()"></p-select>
          <span *ngIf="simulacion() as s" class="lm-small">
            <ng-container *ngIf="s.copagoUfCentesimas !== null; else sinArancel">
              Copago: <strong>{{ s.copagoUfCentesimas / 100 | number: '1.0-2' }} UF</strong>
              <ng-container *ngIf="s.copagoClp !== null">($ {{ s.copagoClp | number }})</ng-container>
              · arancel {{ s.arancel ? (s.arancel.valorUfCentesimas / 100 | number: '1.0-2') + ' UF' : '—' }}
            </ng-container>
            <ng-template #sinArancel>Sin arancel definido para esta materia.</ng-template>
          </span>
        </div>
      </p-card>
    </ng-container>
  `,
})
export class AdminCoberturasComponent implements OnInit {
  private api = inject(CoberturasApiService);
  private maestros = inject(MaestrosApiService);
  private planesApi = inject(PlanesApiService);
  private me = inject(MeService);
  private route = inject(ActivatedRoute);
  private msg = inject(MessageService);

  protected tipos = TIPOS;
  protected modalidades = MODALIDADES;
  protected planes = signal<Plan[]>([]);
  protected competencias = signal<Competencia[]>([]);
  protected materias = signal<Materia[]>([]);
  protected materiasSim = signal<Materia[]>([]);
  protected reglas = signal<CoberturaConMaestros[]>([]);
  protected simulacion = signal<CopagoResultado | null>(null);
  protected loading = signal(false);
  protected editandoId = signal<string | null>(null);
  protected codPlan: string | undefined;
  protected form: FormCobertura = vacio();
  protected sim: { competenciaId: string | null; materiaId: string | null; tipo: TipoAtencion } = {
    competenciaId: null,
    materiaId: null,
    tipo: "Juicio",
  };
  protected puedeEditar = computed(() => this.me.user()?.rol === "Administrador");

  ngOnInit() {
    this.planesApi.listar().subscribe((p) => this.planes.set(p));
    this.maestros.listar("competencias", { vigente: true }).subscribe((c) => this.competencias.set(c));
    const plan = this.route.snapshot.queryParamMap.get("plan");
    if (plan) {
      this.codPlan = plan;
      this.recargar();
    }
  }

  recargar() {
    this.limpiar();
    this.simulacion.set(null);
    if (!this.codPlan) return;
    this.loading.set(true);
    this.api.listar(this.codPlan).subscribe({
      next: (r) => {
        this.reglas.set(r);
        this.loading.set(false);
        this.simular();
      },
      error: () => this.loading.set(false),
    });
  }

  cargarMaterias(competenciaId: string | null) {
    this.form.materiaId = null;
    if (!competenciaId) return this.materias.set([]);
    this.maestros.listar("materias", { competenciaId, vigente: true }).subscribe((m) => this.materias.set(m));
  }

  cargarMateriasSim(competenciaId: string | null) {
    this.sim.materiaId = null;
    this.simulacion.set(null);
    if (!competenciaId) return this.materiasSim.set([]);
    this.maestros.listar("materias", { competenciaId, vigente: true }).subscribe((m) => this.materiasSim.set(m));
  }

  simular() {
    if (!this.codPlan || !this.sim.materiaId) return;
    this.api.copago(this.codPlan, this.sim.materiaId, this.sim.tipo).subscribe((s) => this.simulacion.set(s));
  }

  valido(): boolean {
    if (this.form.modalidad === "Porcentaje") return this.form.porcentaje !== null && this.form.porcentaje !== undefined;
    if (this.form.modalidad === "ValorUF") return this.form.valorUf !== null && this.form.valorUf !== undefined;
    return true;
  }

  guardar() {
    if (!this.codPlan || !this.valido()) return;
    const f = this.form;
    const valores = {
      modalidad: f.modalidad,
      porcentaje: f.modalidad === "Porcentaje" ? f.porcentaje : null,
      valorUfCentesimas: f.modalidad === "ValorUF" && f.valorUf !== null ? Math.round(f.valorUf * 100) : null,
    };
    const id = this.editandoId();
    const req = id
      ? this.api.actualizar(id, valores)
      : this.api.crear({ codPlan: this.codPlan, materiaId: f.materiaId, tipo: f.tipo, ...valores });
    req.subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: id ? "Regla actualizada" : "Regla creada", life: 2500 });
        this.recargar();
      },
      error: (err) => this.error(err),
    });
  }

  editar(r: CoberturaConMaestros) {
    this.editandoId.set(r.id);
    this.form = {
      competenciaId: null,
      materiaId: r.materiaId,
      tipo: r.tipo,
      modalidad: r.modalidad,
      porcentaje: r.porcentaje,
      valorUf: r.valorUfCentesimas === null ? null : r.valorUfCentesimas / 100,
    };
  }

  toggle(r: CoberturaConMaestros) {
    this.api.actualizar(r.id, { vigente: !r.vigente }).subscribe({
      next: () => this.recargar(),
      error: (err) => this.error(err),
    });
  }

  limpiar() {
    this.editandoId.set(null);
    this.form = vacio();
    this.materias.set([]);
  }

  describir(r: CoberturaConMaestros): string {
    if (r.modalidad === "Porcentaje") return `${r.porcentaje}% del arancel`;
    if (r.modalidad === "ValorUF") return `Precio fijo ${((r.valorUfCentesimas ?? 0) / 100).toLocaleString("es-CL")} UF`;
    return "Sin cobertura";
  }

  tipoLabel(t: TipoAtencion | null): string {
    return t ? (TIPOS.find((x) => x.value === t)?.label ?? t) : "Cualquiera";
  }

  private error(err: { error?: { message?: string }; message?: string }) {
    this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 });
  }
}
