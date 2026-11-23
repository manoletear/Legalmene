import { Component, OnInit, computed, inject, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { MessageService } from "primeng/api";
import { PlanesApiService } from "../core/services/planes.service";
import { MaestrosApiService } from "../core/services/maestros.service";
import { UsuariosAdminService } from "../core/services/usuarios-admin.service";
import { PermisoDirective } from "../core/permisos";

export type CampoCriterio = "correlativo" | "rut" | "abogado" | "plan" | "canal" | "competencia" | "materia" | "fechas" | "texto" | "bien";
export type Criterios = Record<string, string | undefined>;

type ClaveCriterio = "correlativo" | "rut" | "q" | "bien" | "abogadoId" | "codPlan" | "canalId" | "competenciaId" | "materiaId" | "estado" | "fechaDesde" | "fechaHasta";
type Valores = Partial<Record<ClaveCriterio, string>>;

interface Opcion {
  label: string;
  value: string;
}

// Formulario de criterios de las búsquedas del Anexo §XI. No busca solo: emite `buscar` cuando
// el usuario presiona "Buscar" y hay al menos un criterio (búsquedas sin precarga).
@Component({
  selector: "lm-criterios-busqueda",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule, PermisoDirective],
  template: `
    <form class="lm-criterios" (ngSubmit)="emitir()">
      <div *ngIf="tiene('correlativo')" class="lm-col" style="gap:4px;">
        <label class="lm-small">{{ etiquetaCorrelativo() }}</label>
        <input pInputText name="correlativo" [(ngModel)]="valores.correlativo" [placeholder]="placeholderCorrelativo()" />
      </div>
      <div *ngIf="tiene('rut')" class="lm-col" style="gap:4px;">
        <label class="lm-small">RUT</label>
        <input pInputText name="rut" [(ngModel)]="valores.rut" placeholder="12.345.678-5" />
      </div>
      <div *ngIf="tiene('texto')" class="lm-col" style="gap:4px;">
        <label class="lm-small">{{ etiquetaTexto() }}</label>
        <input pInputText name="q" [(ngModel)]="valores.q" [placeholder]="placeholderTexto()" />
      </div>
      <div *ngIf="tiene('abogado')" class="lm-col" style="gap:4px;">
        <label class="lm-small">Abogado</label>
        <p-select name="abogadoId" [(ngModel)]="valores.abogadoId" [options]="abogadoOpts()" optionLabel="label" optionValue="value"
          placeholder="Todos" [showClear]="true" [filter]="true" appendTo="body"></p-select>
      </div>
      <div *ngIf="tiene('plan')" class="lm-col" style="gap:4px;">
        <label class="lm-small">Plan</label>
        <p-select name="codPlan" [(ngModel)]="valores.codPlan" [options]="planOpts()" optionLabel="label" optionValue="value"
          placeholder="Todos" [showClear]="true" [filter]="true" appendTo="body"></p-select>
      </div>
      <div *ngIf="tiene('canal')" class="lm-col" style="gap:4px;">
        <label class="lm-small">Canal</label>
        <p-select name="canalId" [(ngModel)]="valores.canalId" [options]="canalOpts()" optionLabel="label" optionValue="value"
          placeholder="Todos" [showClear]="true" appendTo="body"></p-select>
      </div>
      <div *ngIf="tiene('competencia')" class="lm-col" style="gap:4px;">
        <label class="lm-small">Competencia</label>
        <p-select name="competenciaId" [(ngModel)]="valores.competenciaId" (onChange)="valores.materiaId = undefined; competenciaSel.set($event.value)" [options]="competenciaOpts()"
          optionLabel="label" optionValue="value" placeholder="Todas" [showClear]="true" appendTo="body"></p-select>
      </div>
      <div *ngIf="tiene('materia')" class="lm-col" style="gap:4px;">
        <label class="lm-small">Materia</label>
        <p-select name="materiaId" [(ngModel)]="valores.materiaId" [options]="materiaOpts()" optionLabel="label" optionValue="value"
          placeholder="Todas" [showClear]="true" [filter]="true" appendTo="body"></p-select>
      </div>
      <div *ngIf="tiene('bien')" class="lm-col" style="gap:4px;">
        <label class="lm-small">Bien cubierto</label>
        <input pInputText name="bien" [(ngModel)]="valores.bien" placeholder="Rol, patente o descripción" />
      </div>
      <div *ngIf="estados()" class="lm-col" style="gap:4px;">
        <label class="lm-small">Estado</label>
        <p-select name="estado" [(ngModel)]="valores.estado" [options]="estados()!" optionLabel="label" optionValue="value"
          placeholder="Todos" [showClear]="true" appendTo="body"></p-select>
      </div>
      <ng-container *ngIf="tiene('fechas')">
        <div class="lm-col" style="gap:4px;">
          <label class="lm-small">{{ etiquetaFecha() }} desde</label>
          <input pInputText type="date" name="fechaDesde" [(ngModel)]="valores.fechaDesde" />
        </div>
        <div class="lm-col" style="gap:4px;">
          <label class="lm-small">{{ etiquetaFecha() }} hasta</label>
          <input pInputText type="date" name="fechaHasta" [(ngModel)]="valores.fechaHasta" />
        </div>
      </ng-container>
      <ng-content></ng-content>
      <div class="lm-criterios-acciones">
        <button pButton type="submit" icon="pi pi-search" label="Buscar"></button>
        <button pButton type="button" icon="pi pi-refresh" label="Limpiar" [outlined]="true" (click)="limpiar()"></button>
        <ng-container *ngIf="exportable()">
          <button *lmPermiso="'exportar.datos'" pButton type="button" icon="pi pi-file-excel" label="Exportar Excel" [outlined]="true"
            [disabled]="!puedeExportar()" (click)="exportar.emit(criterios())"></button>
        </ng-container>
      </div>
    </form>
  `,
  styles: [
    `
      .lm-criterios { display:grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap:12px; align-items:end; }
      .lm-criterios-acciones { display:flex; gap:8px; flex-wrap:wrap; grid-column: 1 / -1; justify-content:flex-end; }
    `,
  ],
})
export class CriteriosBusquedaComponent implements OnInit {
  private planesApi = inject(PlanesApiService);
  private maestrosApi = inject(MaestrosApiService);
  private usuariosApi = inject(UsuariosAdminService);
  private msg = inject(MessageService);

  readonly campos = input<CampoCriterio[]>(["correlativo", "rut", "abogado", "plan", "canal", "fechas"]);
  readonly estados = input<Opcion[] | null>(null);
  readonly iniciales = input<Criterios>({});
  readonly exportable = input(false);
  // Exportar solo con una búsqueda ya ejecutada (mismos criterios que se ven en pantalla).
  readonly puedeExportar = input(true);
  readonly etiquetaFecha = input("Fecha");
  readonly etiquetaCorrelativo = input("Correlativo");
  readonly placeholderCorrelativo = input("CONS-2026-…");
  readonly etiquetaTexto = input("Texto");
  readonly placeholderTexto = input("");

  readonly buscar = output<Criterios>();
  readonly exportar = output<Criterios>();
  readonly limpiado = output<void>();

  protected valores: Valores = {};
  protected planOpts = signal<Opcion[]>([]);
  protected canalOpts = signal<Opcion[]>([]);
  protected abogadoOpts = signal<Opcion[]>([]);
  protected competenciaOpts = signal<Opcion[]>([]);
  private materias = signal<{ id: string; nombre: string; competenciaId: string }[]>([]);
  protected competenciaSel = signal<string | undefined>(undefined);
  protected materiaOpts = computed<Opcion[]>(() =>
    this.materias()
      .filter((m) => !this.competenciaSel() || m.competenciaId === this.competenciaSel())
      .map((m) => ({ label: m.nombre, value: m.id })),
  );

  protected tiene(c: CampoCriterio): boolean {
    return this.campos().includes(c);
  }

  ngOnInit() {
    this.valores = { ...this.iniciales() };
    this.competenciaSel.set(this.valores.competenciaId);
    const c = this.campos();
    if (c.includes("plan")) this.planesApi.listar().subscribe((ps) => this.planOpts.set(ps.map((p) => ({ label: `${p.codPlan} — ${p.nombre}`, value: p.codPlan }))));
    if (c.includes("canal")) this.planesApi.canales().subscribe((cs) => this.canalOpts.set(cs.map((x) => ({ label: x.nombre, value: x.id }))));
    if (c.includes("abogado")) this.usuariosApi.opciones().subscribe((us) => this.abogadoOpts.set(us.map((u) => ({ label: u.nombre, value: u.id }))));
    if (c.includes("competencia")) this.maestrosApi.listar("competencias").subscribe((cs) => this.competenciaOpts.set(cs.map((x) => ({ label: x.nombre, value: x.id }))));
    if (c.includes("materia")) this.maestrosApi.listar("materias").subscribe((ms) => this.materias.set(ms));
  }

  criterios(): Criterios {
    const out: Criterios = {};
    for (const [k, v] of Object.entries(this.valores)) {
      const t = typeof v === "string" ? v.trim() : v;
      if (t) out[k] = t;
    }
    return out;
  }

  emitir() {
    const c = this.criterios();
    if (Object.keys(c).length === 0) {
      this.msg.add({ severity: "warn", summary: "Sin criterios", detail: "Ingrese al menos un criterio de búsqueda", life: 3000 });
      return;
    }
    if (c["fechaDesde"] && c["fechaHasta"] && c["fechaDesde"] > c["fechaHasta"]) {
      this.msg.add({ severity: "warn", summary: "Fechas inválidas", detail: "La fecha desde debe ser anterior a la fecha hasta", life: 3000 });
      return;
    }
    this.buscar.emit(c);
  }

  limpiar() {
    this.valores = {};
    this.competenciaSel.set(undefined);
    this.limpiado.emit();
  }
}
