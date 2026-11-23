import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import type { Competencia, GestionPlantilla, Materia, Procedimiento, TipoGestion } from "@legalmene/shared";
import { MaestrosApiService } from "../../core/services/maestros.service";

const TIPOS: { label: string; value: TipoGestion }[] = [
  { label: "Llamada telefónica", value: "LlamadaTelefonica" },
  { label: "Correo", value: "Email" },
  { label: "Reunión", value: "Reunion" },
  { label: "Escrito judicial", value: "EscritoJudicial" },
  { label: "Audiencia", value: "Audiencia" },
  { label: "Notificación", value: "Notificacion" },
  { label: "Análisis documental", value: "AnalisisDocumental" },
  { label: "Resolución", value: "Resolucion" },
  { label: "Otra", value: "Otra" },
];

interface FormPlantilla {
  materiaId: string | null;
  procedimientoId: string | null;
  orden: number;
  titulo: string;
  tipo: TipoGestion;
  plazoDiasHabiles: number;
}

const vacio = (): FormPlantilla => ({ materiaId: null, procedimientoId: null, orden: 1, titulo: "", tipo: "Otra", plazoDiasHabiles: 5 });

// Gestiones que se crean solas al abrir una asesoría/juicio de la materia o procedimiento.
@Component({
  selector: "lm-admin-plantillas",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, InputTextModule, InputNumberModule, SelectModule, ButtonModule, TableModule, TagModule],
  template: `
    <p-card [style]="{ display: 'block', 'margin-top': '16px' }">
      <p class="lm-small lm-muted" style="margin-top:0;">
        Al crear o derivar una asesoría o juicio se agregan estas gestiones como pendientes, con fecha de compromiso
        a N días hábiles (lunes a viernes; los feriados aún no se descuentan). Las del procedimiento se agregan al definirlo en el juicio.
      </p>
      <div class="lm-row" style="flex-wrap:wrap; gap:8px; margin-bottom:16px;">
        <p-select [(ngModel)]="competenciaId" [options]="competencias()" optionLabel="nombre" optionValue="id" placeholder="Competencia" appendTo="body" (onChange)="cargarDeCompetencia()" [style]="{ width: '180px' }"></p-select>
        <p-select [(ngModel)]="form.materiaId" [options]="materias()" optionLabel="nombre" optionValue="id" placeholder="Materia" appendTo="body" [showClear]="true" [style]="{ width: '200px' }"></p-select>
        <p-select [(ngModel)]="form.procedimientoId" [options]="procedimientos()" optionLabel="nombre" optionValue="id" placeholder="o Procedimiento" appendTo="body" [showClear]="true" [style]="{ width: '220px' }"></p-select>
        <p-inputNumber [(ngModel)]="form.orden" [min]="1" placeholder="Orden" [inputStyle]="{ width: '70px' }"></p-inputNumber>
        <input pInputText [(ngModel)]="form.titulo" placeholder="Título de la gestión" style="flex:1; min-width:200px;" />
        <p-select [(ngModel)]="form.tipo" [options]="tipos" optionLabel="label" optionValue="value" appendTo="body" [style]="{ width: '170px' }"></p-select>
        <p-inputNumber [(ngModel)]="form.plazoDiasHabiles" [min]="0" [max]="365" suffix=" días háb." [inputStyle]="{ width: '110px' }"></p-inputNumber>
        <button pButton label="Agregar" icon="pi pi-plus" [disabled]="!valido()" (click)="agregar()"></button>
      </div>

      <p-table [value]="filas()" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Aplica a</th><th>Orden</th><th>Gestión</th><th>Tipo</th><th>Plazo</th><th>Estado</th><th></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-p>
          <tr>
            <td class="lm-small">{{ aplicaA(p) }}</td>
            <td>{{ p.orden }}</td>
            <td>{{ p.titulo }}</td>
            <td class="lm-small">{{ etiquetaTipo(p.tipo) }}</td>
            <td>{{ p.plazoDiasHabiles }} días háb.</td>
            <td><p-tag [value]="p.vigente ? 'Vigente' : 'No vigente'" [severity]="p.vigente ? 'success' : 'secondary'"></p-tag></td>
            <td style="text-align:right;">
              <button pButton type="button" class="p-button-text p-button-sm" [label]="p.vigente ? 'Desactivar' : 'Activar'" (click)="toggle(p)"></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" style="text-align:center; padding:24px;" class="lm-muted">Sin gestiones predefinidas.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class AdminPlantillasComponent implements OnInit {
  private api = inject(MaestrosApiService);
  private msg = inject(MessageService);

  protected tipos = TIPOS;
  protected filas = signal<GestionPlantilla[]>([]);
  protected loading = signal(false);
  protected competencias = signal<Competencia[]>([]);
  protected materias = signal<Materia[]>([]);
  protected procedimientos = signal<Procedimiento[]>([]);
  private todasMaterias = signal<Materia[]>([]);
  private todosProcedimientos = signal<Procedimiento[]>([]);
  protected competenciaId: string | null = null;
  protected form: FormPlantilla = vacio();

  private nombreMateria = computed(() => new Map(this.todasMaterias().map((m) => [m.id, m.nombre])));
  private nombreProcedimiento = computed(() => new Map(this.todosProcedimientos().map((p) => [p.id, p.nombre])));

  ngOnInit() {
    this.api.listar("competencias", { vigente: true }).subscribe((c) => this.competencias.set(c));
    this.api.listar("materias").subscribe((m) => this.todasMaterias.set(m));
    this.api.listar("procedimientos").subscribe((p) => this.todosProcedimientos.set(p));
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api.listarPlantillas().subscribe({
      next: (r) => {
        this.filas.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  cargarDeCompetencia() {
    this.form.materiaId = null;
    this.form.procedimientoId = null;
    if (!this.competenciaId) return;
    this.api.listar("materias", { competenciaId: this.competenciaId, vigente: true }).subscribe((m) => this.materias.set(m));
    this.api.listar("procedimientos", { competenciaId: this.competenciaId, vigente: true }).subscribe((p) => this.procedimientos.set(p));
  }

  protected valido(): boolean {
    return Boolean(this.form.titulo.trim()) && Boolean(this.form.materiaId || this.form.procedimientoId);
  }

  protected aplicaA(p: GestionPlantilla): string {
    if (p.materiaId) return `Materia: ${this.nombreMateria().get(p.materiaId) ?? "—"}`;
    return `Procedimiento: ${this.nombreProcedimiento().get(p.procedimientoId ?? "") ?? "—"}`;
  }

  protected etiquetaTipo(t: TipoGestion): string {
    return TIPOS.find((x) => x.value === t)?.label ?? t;
  }

  agregar() {
    this.api.crearPlantilla({ ...this.form, titulo: this.form.titulo.trim() }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Gestión predefinida agregada", life: 2500 });
        this.form = { ...vacio(), materiaId: this.form.materiaId, procedimientoId: this.form.procedimientoId, orden: this.form.orden + 1 };
        this.recargar();
      },
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 5000 }),
    });
  }

  toggle(p: GestionPlantilla) {
    this.api.actualizarPlantilla(p.id, { vigente: !p.vigente }).subscribe(() => this.recargar());
  }
}
