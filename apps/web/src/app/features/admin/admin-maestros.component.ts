import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { CheckboxModule } from "primeng/checkbox";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { TabsModule } from "primeng/tabs";
import { MessageService } from "primeng/api";
import { MaestrosApiService, TipoMaestro } from "../../core/services/maestros.service";
import type { Competencia } from "@legalmene/shared";
import { AdminPlantillasComponent } from "./admin-plantillas.component";

interface DefTab {
  tipo: TipoMaestro;
  titulo: string;
  porCompetencia?: boolean;
  ubicacion?: boolean;
  flags?: boolean;
}

const TABS: DefTab[] = [
  { tipo: "competencias", titulo: "Competencias" },
  { tipo: "materias", titulo: "Materias", porCompetencia: true, flags: true },
  { tipo: "procedimientos", titulo: "Procedimientos", porCompetencia: true },
  { tipo: "tribunales", titulo: "Tribunales", ubicacion: true },
  { tipo: "organismos", titulo: "Organismos" },
  { tipo: "tipos-consulta", titulo: "Tipos de consulta" },
  { tipo: "causas-termino", titulo: "Causas de término" },
  { tipo: "calidades-procesales", titulo: "Calidades procesales" },
];

// Fila genérica: cada maestro usa un subconjunto de estos campos.
interface Fila {
  id: string;
  nombre: string;
  vigente: boolean;
  competenciaId?: string;
  region?: string | null;
  comuna?: string | null;
  aplicaConsulta?: boolean;
  aplicaAsesoria?: boolean;
  aplicaJuicio?: boolean;
  requiereProvision?: boolean;
}

const vacio = (): Partial<Fila> => ({
  nombre: "",
  aplicaConsulta: true,
  aplicaAsesoria: true,
  aplicaJuicio: true,
  requiereProvision: false,
});

@Component({
  selector: "lm-admin-maestros",
  standalone: true,
  imports: [
    CommonModule, FormsModule, CardModule, InputTextModule, SelectModule, CheckboxModule, ButtonModule,
    TableModule, TagModule, TabsModule, AdminPlantillasComponent,
  ],
  template: `
    <div style="margin-bottom:16px;">
      <h1 style="margin:0 0 4px 0;">Maestros</h1>
      <small class="lm-muted">Tablas que alimentan los formularios. Desactivar oculta el valor en formularios nuevos sin afectar registros históricos.</small>
    </div>

    <p-tabs [value]="verPlantillas() ? 'plantillas' : tab().tipo" (valueChange)="cambiarTab($event)">
      <p-tablist>
        <p-tab *ngFor="let t of tabs" [value]="t.tipo">{{ t.titulo }}</p-tab>
        <p-tab value="plantillas">Gestiones predefinidas</p-tab>
      </p-tablist>
    </p-tabs>

    <lm-admin-plantillas *ngIf="verPlantillas()"></lm-admin-plantillas>

    <p-card *ngIf="!verPlantillas()" [style]="{ display: 'block', 'margin-top': '16px' }">
      <form (ngSubmit)="guardar()" class="lm-row" style="flex-wrap:wrap; align-items:center; margin-bottom:16px;">
        <p-select *ngIf="tab().porCompetencia" [(ngModel)]="form.competenciaId" name="competenciaId" [options]="competencias()"
          optionLabel="nombre" optionValue="id" placeholder="Competencia" appendTo="body" [style]="{ width: '200px' }"></p-select>
        <input pInputText [(ngModel)]="form.nombre" name="nombre" placeholder="Nombre" class="lm-grow" style="min-width:220px;" maxlength="200" />
        <ng-container *ngIf="tab().ubicacion">
          <input pInputText [(ngModel)]="form.region" name="region" placeholder="Región" style="width:160px;" />
          <input pInputText [(ngModel)]="form.comuna" name="comuna" placeholder="Comuna" style="width:160px;" />
        </ng-container>
        <ng-container *ngIf="tab().flags">
          <label class="lm-small"><p-checkbox [(ngModel)]="form.aplicaConsulta" name="ac" [binary]="true"></p-checkbox> Consulta</label>
          <label class="lm-small"><p-checkbox [(ngModel)]="form.aplicaAsesoria" name="aa" [binary]="true"></p-checkbox> Asesoría</label>
          <label class="lm-small"><p-checkbox [(ngModel)]="form.aplicaJuicio" name="aj" [binary]="true"></p-checkbox> Juicio</label>
          <label class="lm-small"><p-checkbox [(ngModel)]="form.requiereProvision" name="rp" [binary]="true"></p-checkbox> Requiere provisión</label>
        </ng-container>
        <button pButton type="submit" [label]="editandoId() ? 'Guardar cambios' : 'Agregar'" [icon]="editandoId() ? 'pi pi-check' : 'pi pi-plus'" [disabled]="!valido()"></button>
        <button *ngIf="editandoId()" pButton type="button" label="Cancelar" [text]="true" severity="secondary" (click)="limpiar()"></button>
      </form>

      <div class="lm-row" *ngIf="tab().porCompetencia" style="margin-bottom:12px;">
        <p-select [(ngModel)]="filtroCompetencia" [options]="competencias()" optionLabel="nombre" optionValue="id"
          placeholder="Todas las competencias" [showClear]="true" [style]="{ width: '240px' }" (onChange)="recargar()"></p-select>
      </div>

      <p-table [value]="filas()" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Nombre</th>
            <th *ngIf="tab().porCompetencia">Competencia</th>
            <th *ngIf="tab().ubicacion">Región</th>
            <th *ngIf="tab().ubicacion">Comuna</th>
            <th *ngIf="tab().flags">Aplica a</th>
            <th *ngIf="tab().flags">Provisión</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-f>
          <tr>
            <td>{{ f.nombre }}</td>
            <td *ngIf="tab().porCompetencia">{{ nombreCompetencia(f.competenciaId) }}</td>
            <td *ngIf="tab().ubicacion">{{ f.region || '—' }}</td>
            <td *ngIf="tab().ubicacion">{{ f.comuna || '—' }}</td>
            <td *ngIf="tab().flags" class="lm-small">{{ aplicaA(f) }}</td>
            <td *ngIf="tab().flags">{{ f.requiereProvision ? 'Sí' : 'No' }}</td>
            <td><p-tag [value]="f.vigente ? 'Vigente' : 'No vigente'" [severity]="f.vigente ? 'success' : 'secondary'"></p-tag></td>
            <td style="text-align:right; white-space:nowrap;">
              <button pButton type="button" class="p-button-text p-button-sm" label="Editar" (click)="editar(f)"></button>
              <button pButton type="button" class="p-button-text p-button-sm" [label]="f.vigente ? 'Desactivar' : 'Activar'" (click)="toggle(f)"></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="8" style="text-align:center; padding:24px;" class="lm-muted">Sin registros.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class AdminMaestrosComponent implements OnInit {
  private api = inject(MaestrosApiService);
  private msg = inject(MessageService);

  protected tabs = TABS;
  protected tab = signal<DefTab>(TABS[0]);
  protected verPlantillas = signal(false);
  protected filas = signal<Fila[]>([]);
  protected competencias = signal<Competencia[]>([]);
  protected loading = signal(false);
  protected editandoId = signal<string | null>(null);
  protected form: Partial<Fila> = vacio();
  protected filtroCompetencia: string | undefined;
  private competenciaPorId = computed(() => new Map(this.competencias().map((c) => [c.id, c.nombre])));

  ngOnInit() {
    this.cargarCompetencias();
    this.recargar();
  }

  cambiarTab(tipo: string | number | undefined) {
    this.verPlantillas.set(tipo === "plantillas");
    const t = TABS.find((x) => x.tipo === tipo);
    if (!t) return;
    this.tab.set(t);
    this.filtroCompetencia = undefined;
    this.limpiar();
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    const filtro = this.tab().porCompetencia ? { competenciaId: this.filtroCompetencia } : {};
    this.api.listar(this.tab().tipo, filtro).subscribe({
      next: (rows) => {
        this.filas.set(rows as Fila[]);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  valido(): boolean {
    return !!this.form.nombre?.trim() && (!this.tab().porCompetencia || !!this.form.competenciaId);
  }

  guardar() {
    if (!this.valido()) return;
    const t = this.tab();
    const body: Partial<Fila> = { nombre: this.form.nombre!.trim() };
    if (t.porCompetencia) body.competenciaId = this.form.competenciaId;
    if (t.ubicacion) {
      body.region = this.form.region?.trim() || null;
      body.comuna = this.form.comuna?.trim() || null;
    }
    if (t.flags) {
      body.aplicaConsulta = !!this.form.aplicaConsulta;
      body.aplicaAsesoria = !!this.form.aplicaAsesoria;
      body.aplicaJuicio = !!this.form.aplicaJuicio;
      body.requiereProvision = !!this.form.requiereProvision;
    }
    const id = this.editandoId();
    const req = id ? this.api.actualizar(t.tipo, id, body) : this.api.crear(t.tipo, body);
    req.subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: id ? "Cambios guardados" : "Registro creado", life: 2500 });
        if (t.tipo === "competencias") this.cargarCompetencias();
        this.limpiar();
        this.recargar();
      },
      error: (err) => this.error(err),
    });
  }

  editar(f: Fila) {
    this.editandoId.set(f.id);
    this.form = { ...f };
  }

  toggle(f: Fila) {
    this.api.actualizar(this.tab().tipo, f.id, { vigente: !f.vigente }).subscribe({
      next: () => {
        if (this.tab().tipo === "competencias") this.cargarCompetencias();
        this.recargar();
      },
      error: (err) => this.error(err),
    });
  }

  limpiar() {
    this.editandoId.set(null);
    this.form = vacio();
  }

  nombreCompetencia(id?: string): string {
    return (id && this.competenciaPorId().get(id)) || "—";
  }

  aplicaA(f: Fila): string {
    const t = [f.aplicaConsulta && "Consulta", f.aplicaAsesoria && "Asesoría", f.aplicaJuicio && "Juicio"].filter(Boolean);
    return t.length ? t.join(", ") : "Ninguno";
  }

  private cargarCompetencias() {
    this.api.listar("competencias").subscribe((c) => this.competencias.set(c));
  }

  private error(err: { error?: { message?: string }; message?: string }) {
    this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 });
  }
}
