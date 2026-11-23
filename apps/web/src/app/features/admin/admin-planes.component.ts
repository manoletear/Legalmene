import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { DialogModule } from "primeng/dialog";
import { CheckboxModule } from "primeng/checkbox";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { MessageService } from "primeng/api";
import { CreatePlanSchema, PLANES_SIN_COBERTURA, type Canal, type PlanResumen } from "@legalmene/shared";
import { PlanesApiService } from "../../core/services/planes.service";
import { PermisoDirective } from "../../core/permisos";

type FormPlan = {
  codPlan: string;
  nombre: string;
  descripcion: string;
  canalId: string | null;
  vigente: boolean;
  fechaTermino: string;
  copiarDe: string | null;
};

// Planes (productos) del Anexo §II l.118: alta, término de vigencia y coberturas (copiar de otro plan).
@Component({
  selector: "lm-admin-planes",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CardModule,
    TableModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DialogModule,
    CheckboxModule,
    ToggleSwitchModule,
    PermisoDirective,
  ],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Planes</h1>
        <small class="lm-muted">Productos contratables. Un plan con término de vigencia vencido o desactivado no admite nuevas atenciones.</small>
      </div>
      <button *lmPermiso="'planes.administrar'" pButton icon="pi pi-plus" label="Nuevo plan" (click)="abrir(null)"></button>
    </div>

    <p-card>
      <p-table [value]="planes()" styleClass="p-datatable-sm" [loading]="cargando()">
        <ng-template pTemplate="header">
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Canal</th>
            <th>Término de vigencia</th>
            <th>Estado</th>
            <th>Coberturas</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-p>
          <tr>
            <td class="lm-mono"><strong>{{ p.codPlan }}</strong></td>
            <td>{{ p.nombre }} <div class="lm-small lm-muted" *ngIf="p.descripcion">{{ p.descripcion }}</div></td>
            <td>{{ nombreCanal(p.canalId) }}</td>
            <td>{{ p.fechaTermino ? (p.fechaTermino | date: 'dd-MM-yyyy') : 'Sin término' }}</td>
            <td>
              <p-tag [value]="p.vigenteHoy ? 'Vigente' : p.vigente ? 'Término vencido' : 'Desactivado'" [severity]="p.vigenteHoy ? 'success' : 'secondary'"></p-tag>
            </td>
            <td>
              <a [routerLink]="['/admin/coberturas']" [queryParams]="{ plan: p.codPlan }">{{ p.coberturas }} {{ p.coberturas === 1 ? 'regla' : 'reglas' }}</a>
            </td>
            <td style="text-align:right; white-space:nowrap;">
              <ng-container *ngIf="!sinCobertura(p.codPlan)">
                <button *lmPermiso="'coberturas.administrar'" pButton icon="pi pi-copy" [text]="true" size="small" label="Copiar coberturas" (click)="abrirCopia(p)"></button>
              </ng-container>
              <button *lmPermiso="'planes.administrar'" pButton icon="pi pi-pencil" [text]="true" size="small" label="Editar" (click)="abrir(p)"></button>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" class="lm-muted" style="text-align:center; padding:24px;">Sin planes.</td></tr>
        </ng-template>
      </p-table>
    </p-card>

    <p-dialog [header]="editando() ? 'Editar plan ' + editando()!.codPlan : 'Nuevo plan'" [visible]="formVisible()" (visibleChange)="formVisible.set($event)" [modal]="true" [style]="{ width: '540px', maxWidth: '95vw' }">
      <form class="lm-col" style="gap:12px;" (ngSubmit)="guardar()">
        <label *ngIf="!editando()" class="lm-col" style="gap:4px;">Código *<input pInputText name="codPlan" [(ngModel)]="f.codPlan" maxlength="20" placeholder="EMP02" /></label>
        <label class="lm-col" style="gap:4px;">Nombre *<input pInputText name="nombre" [(ngModel)]="f.nombre" maxlength="200" /></label>
        <label class="lm-col" style="gap:4px;">Descripción<textarea pTextarea name="descripcion" [(ngModel)]="f.descripcion" rows="2"></textarea></label>
        <label class="lm-col" style="gap:4px;">Canal
          <p-select name="canalId" [(ngModel)]="f.canalId" [options]="canales()" optionLabel="nombre" optionValue="id" [showClear]="true" placeholder="Sin canal" appendTo="body"></p-select>
        </label>
        <label class="lm-col" style="gap:4px;">Término de vigencia
          <input pInputText type="date" name="fechaTermino" [(ngModel)]="f.fechaTermino" />
          <small class="lm-muted">Vacío = sin término. El plan es vigente hasta ese día inclusive.</small>
        </label>
        <label *ngIf="editando()" class="lm-row" style="gap:8px; align-items:center;">
          <p-toggleSwitch name="vigente" [(ngModel)]="f.vigente"></p-toggleSwitch> Plan activo
        </label>
        <label *ngIf="!editando()" class="lm-col" style="gap:4px;">Copiar coberturas de
          <p-select name="copiarDe" [(ngModel)]="f.copiarDe" [options]="origenes('')" optionLabel="label" optionValue="value" [showClear]="true" placeholder="No copiar (se asignan después)" appendTo="body"></p-select>
        </label>
        <p *ngIf="error()" role="alert" style="color:var(--p-red-600,#c62828); margin:0;">{{ error() }}</p>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton type="button" label="Cancelar" [text]="true" (click)="formVisible.set(false)"></button>
          <button pButton type="submit" [label]="editando() ? 'Guardar' : 'Crear plan'" icon="pi pi-check" [loading]="guardando()"></button>
        </div>
      </form>
    </p-dialog>

    <p-dialog [header]="'Copiar coberturas a ' + (copiaA()?.codPlan ?? '')" [visible]="!!copiaA()" (visibleChange)="!$event && copiaA.set(null)" [modal]="true" [style]="{ width: '460px', maxWidth: '95vw' }">
      <div class="lm-col" style="gap:12px;">
        <label class="lm-col" style="gap:4px;">Plan de origen *
          <p-select [(ngModel)]="copiaDesde" [options]="origenes(copiaA()?.codPlan ?? '')" optionLabel="label" optionValue="value" placeholder="Seleccione" appendTo="body"></p-select>
        </label>
        <label class="lm-row" style="gap:8px; align-items:center;">
          <p-checkbox [(ngModel)]="copiaReemplazar" [binary]="true" inputId="reemplazar"></p-checkbox>
          <span>Reemplazar las reglas que el plan ya tiene para la misma materia y tipo</span>
        </label>
        <small class="lm-muted">Sin reemplazar, las reglas existentes se conservan y solo se agregan las que faltan.</small>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton label="Cancelar" [text]="true" (click)="copiaA.set(null)"></button>
          <button pButton label="Copiar" icon="pi pi-copy" [disabled]="!copiaDesde" (click)="copiar()"></button>
        </div>
      </div>
    </p-dialog>
  `,
})
export class AdminPlanesComponent implements OnInit {
  private api = inject(PlanesApiService);
  private msg = inject(MessageService);

  protected planes = signal<PlanResumen[]>([]);
  protected canales = signal<Canal[]>([]);
  protected cargando = signal(false);
  protected formVisible = signal(false);
  protected editando = signal<PlanResumen | null>(null);
  protected guardando = signal(false);
  protected error = signal<string | null>(null);
  protected f: FormPlan = this.vacio();
  protected copiaA = signal<PlanResumen | null>(null);
  protected copiaDesde: string | null = null;
  protected copiaReemplazar = false;
  private canalPorId = computed(() => new Map(this.canales().map((c) => [c.id, c.nombre])));

  ngOnInit() {
    this.api.canales().subscribe((c) => this.canales.set(c));
    this.recargar();
  }

  private vacio(): FormPlan {
    return { codPlan: "", nombre: "", descripcion: "", canalId: null, vigente: true, fechaTermino: "", copiarDe: null };
  }

  private recargar() {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (p) => {
        this.planes.set(p);
        this.cargando.set(false);
      },
      error: (err) => {
        this.cargando.set(false);
        this.fallo("No se pudieron cargar los planes", err);
      },
    });
  }

  private fallo(summary: string, err: { error?: { message?: string }; message: string }) {
    this.msg.add({ severity: "error", summary, detail: err.error?.message ?? err.message, life: 6000 });
  }

  protected nombreCanal(id: string | null): string {
    return (id && this.canalPorId().get(id)) || "—";
  }

  protected sinCobertura(codPlan: string): boolean {
    return (PLANES_SIN_COBERTURA as readonly string[]).includes(codPlan);
  }

  // Planes desde los que se puede copiar: con reglas y distintos del destino.
  protected origenes(excluir: string) {
    return this.planes()
      .filter((p) => p.codPlan !== excluir && p.coberturas > 0)
      .map((p) => ({ label: `${p.codPlan} — ${p.nombre} (${p.coberturas})`, value: p.codPlan }));
  }

  protected abrir(p: PlanResumen | null) {
    this.editando.set(p);
    this.error.set(null);
    this.f = p
      ? { codPlan: p.codPlan, nombre: p.nombre, descripcion: p.descripcion ?? "", canalId: p.canalId ?? null, vigente: p.vigente, fechaTermino: p.fechaTermino ?? "", copiarDe: null }
      : this.vacio();
    this.formVisible.set(true);
  }

  protected guardar() {
    const datos = {
      codPlan: this.f.codPlan,
      nombre: this.f.nombre,
      descripcion: this.f.descripcion.trim() || null,
      canalId: this.f.canalId || null,
      vigente: this.f.vigente,
      fechaTermino: this.f.fechaTermino || null,
    };
    const actual = this.editando();
    const v = actual ? CreatePlanSchema.omit({ codPlan: true }).safeParse(datos) : CreatePlanSchema.safeParse(datos);
    if (!v.success) {
      const i = v.error.issues[0];
      const campo: Record<string, string> = { codPlan: "Código", nombre: "Nombre", fechaTermino: "Término de vigencia" };
      this.error.set(`${campo[String(i.path[0])] ?? i.path.join(".")}: ${i.message}`);
      return;
    }
    this.error.set(null);
    this.guardando.set(true);
    const { codPlan: _codigo, ...patch } = v.data as typeof datos;
    const op = actual ? this.api.actualizar(actual.codPlan, patch) : this.api.crear(v.data as typeof datos);
    op.subscribe({
      next: (plan) => {
        const copiarDe = !actual ? this.f.copiarDe : null;
        const fin = (detalle?: string) => {
          this.guardando.set(false);
          this.formVisible.set(false);
          this.msg.add({ severity: "success", summary: actual ? "Plan actualizado" : "Plan creado", detail: detalle ?? plan.codPlan, life: 3500 });
          this.recargar();
        };
        if (!copiarDe) return fin();
        this.api.copiarCoberturas(plan.codPlan, { desde: copiarDe, reemplazar: false }).subscribe({
          next: (r) => fin(`${plan.codPlan}: ${r.copiadas} reglas de cobertura copiadas de ${copiarDe}`),
          error: (err) => {
            fin();
            this.fallo("El plan se creó, pero no se pudieron copiar las coberturas", err);
          },
        });
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err.error?.message ?? err.message);
      },
    });
  }

  protected abrirCopia(p: PlanResumen) {
    this.copiaDesde = null;
    this.copiaReemplazar = false;
    this.copiaA.set(p);
  }

  protected copiar() {
    const destino = this.copiaA();
    if (!destino || !this.copiaDesde) return;
    this.api.copiarCoberturas(destino.codPlan, { desde: this.copiaDesde, reemplazar: this.copiaReemplazar }).subscribe({
      next: (r) => {
        this.copiaA.set(null);
        this.msg.add({
          severity: "success",
          summary: "Coberturas copiadas",
          detail: `${r.copiadas} copiadas${r.omitidas ? `, ${r.omitidas} conservadas del plan` : ""}`,
          life: 4000,
        });
        this.recargar();
      },
      error: (err) => this.fallo("No se pudieron copiar las coberturas", err),
    });
  }
}
