import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { FormsModule } from "@angular/forms";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { ConfirmationService, MessageService } from "primeng/api";
import { PARENTESCO_LABEL, type AfiliadoConPlanes, type BienAfiliado, type CargaAfiliado, type Parentesco, type Plan, type PlanAfiliadoDetalle } from "@legalmene/shared";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { PlanesApiService } from "../../core/services/planes.service";
import { PermisoDirective } from "../../core/permisos";
import { AfiliadoFormComponent } from "./afiliado-form.component";

const TIPO_BIEN: Record<string, string> = { Inmueble: "Inmueble", Vehiculo: "Vehículo", Otro: "Otro" };

// Ficha del afiliado: datos, planes con vigencia, cargas y bienes cubiertos por cada RUT–Plan.
@Component({
  selector: "lm-afiliado-detail",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CardModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, SelectModule, PermisoDirective, AfiliadoFormComponent],
  template: `
    <div *ngIf="afiliado() as a; else cargando">
      <div class="lm-row" style="margin-bottom:16px; align-items:flex-start;">
        <div style="flex:1;">
          <small class="lm-muted"><a routerLink="/afiliados">Afiliados</a> / {{ a.rut }}</small>
          <h1 style="margin:4px 0;">{{ a.nombres }} {{ a.apellidoPaterno }} {{ a.apellidoMaterno }}</h1>
          <span class="lm-muted">{{ a.rut }} · {{ a.email || 'sin correo' }} · {{ a.telefono || 'sin teléfono' }}</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <p-tag [value]="a.vigencia" [severity]="a.vigencia === 'Activo' ? 'success' : a.vigencia === 'Eliminado' ? 'danger' : 'secondary'"></p-tag>
          <ng-container *ngIf="a.vigencia !== 'Eliminado'">
            <button *lmPermiso="'afiliados.editar'" pButton icon="pi pi-pencil" label="Editar" [outlined]="true" size="small" (click)="editando.set(true)"></button>
            <button *lmPermiso="'afiliados.eliminar'" pButton icon="pi pi-trash" label="Eliminar" severity="danger" [outlined]="true" size="small" (click)="eliminar(a)"></button>
          </ng-container>
          <ng-container *ngIf="a.vigencia === 'Eliminado'">
            <button *lmPermiso="'afiliados.eliminar'" pButton icon="pi pi-replay" label="Restaurar" [outlined]="true" size="small" (click)="restaurar(a)"></button>
          </ng-container>
        </div>
      </div>
      <lm-afiliado-form [visible]="editando()" [afiliado]="a" (cerrar)="editando.set(false)" (guardado)="editado()"></lm-afiliado-form>

      <p-card [style]="{ 'margin-bottom': '16px', display: 'block' }">
        <ng-template pTemplate="title">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>Planes</span>
            <ng-container *ngIf="a.vigencia !== 'Eliminado'">
              <button *lmPermiso="'afiliados.asignar_planes'" pButton icon="pi pi-plus" label="Asignar plan" size="small" [outlined]="true" (click)="abrirAsignar()"></button>
            </ng-container>
          </div>
        </ng-template>
        <p-table [value]="a.planes" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Plan</th><th>Inicio</th><th>Término</th><th>Estado</th><th></th></tr></ng-template>
          <ng-template pTemplate="body" let-p>
            <tr>
              <td><strong>{{ p.codPlan }}</strong> <span class="lm-muted lm-small">{{ p.nombrePlan }}</span></td>
              <td>{{ p.fechaInicio }}</td>
              <td>{{ p.fechaTermino ?? 'sin término' }}</td>
              <td><p-tag [value]="p.vigente ? 'Vigente' : 'No vigente'" [severity]="p.vigente ? 'success' : 'secondary'"></p-tag></td>
              <td style="text-align:right;">
                <ng-container *ngIf="!p.fechaTermino && a.vigencia !== 'Eliminado'">
                  <button *lmPermiso="'afiliados.asignar_planes'" pButton icon="pi pi-calendar-times" label="Terminar" size="small" [text]="true" (click)="abrirTermino(p)"></button>
                </ng-container>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="lm-muted" style="text-align:center;">Sin planes.</td></tr></ng-template>
        </p-table>
      </p-card>

      <p-card header="Cargas" [style]="{ 'margin-bottom': '16px', display: 'block' }">
        <p-table [value]="cargas()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>RUT</th><th>Nombre</th><th>Parentesco</th><th>Plan</th><th>Vigencia</th></tr></ng-template>
          <ng-template pTemplate="body" let-c>
            <tr>
              <td>{{ c.rut }}</td>
              <td>{{ c.nombres }} {{ c.apellidoPaterno }} {{ c.apellidoMaterno }}</td>
              <td>{{ parentesco(c.parentesco) }}</td>
              <td>{{ c.codPlan }}</td>
              <td><p-tag [value]="c.vigente ? 'Vigente' : 'No vigente'" [severity]="c.vigente ? 'success' : 'secondary'"></p-tag>
                <span class="lm-small lm-muted"> {{ c.fechaInicio }} → {{ c.fechaTermino ?? 'sin término' }}</span></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="lm-muted" style="text-align:center;">Sin cargas registradas.</td></tr></ng-template>
        </p-table>
      </p-card>

      <p-card header="Bienes cubiertos" [style]="{ 'margin-bottom': '16px', display: 'block' }">
        <p-table [value]="bienes()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Tipo</th><th>Identificador</th><th>Descripción</th><th>Plan</th><th>Vigencia</th></tr></ng-template>
          <ng-template pTemplate="body" let-b>
            <tr>
              <td>{{ tipoBien(b.tipo) }}</td>
              <td class="lm-mono">{{ b.identificador }}</td>
              <td>{{ b.descripcion }} <span class="lm-muted lm-small">{{ b.comuna }}</span></td>
              <td>{{ b.codPlan }}</td>
              <td><p-tag [value]="b.vigente ? 'Vigente' : 'No vigente'" [severity]="b.vigente ? 'success' : 'secondary'"></p-tag></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="lm-muted" style="text-align:center;">Sin bienes registrados.</td></tr></ng-template>
        </p-table>
      </p-card>

      <a pButton icon="pi pi-search" label="Ver atenciones del afiliado" [outlined]="true" routerLink="/atenciones" [queryParams]="{ rut: a.rut }"></a>
    </div>
    <p-dialog header="Asignar plan" [visible]="asignando()" (visibleChange)="asignando.set($event)" [modal]="true" [style]="{ width: '420px', maxWidth: '95vw' }">
      <div class="lm-col" style="gap:12px;">
        <label class="lm-col" style="gap:4px;">Plan *
          <p-select [(ngModel)]="nuevoPlan.codPlan" [options]="planes()" optionLabel="nombre" optionValue="codPlan" placeholder="Seleccione" appendTo="body" [filter]="true"></p-select>
        </label>
        <label class="lm-col" style="gap:4px;">Fecha de inicio *<input pInputText type="date" [(ngModel)]="nuevoPlan.fechaInicio" /></label>
        <label class="lm-col" style="gap:4px;">Fecha de término (opcional)<input pInputText type="date" [(ngModel)]="nuevoPlan.fechaTermino" /></label>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton label="Cancelar" [text]="true" (click)="asignando.set(false)"></button>
          <button pButton label="Asignar" icon="pi pi-check" [disabled]="!nuevoPlan.codPlan || !nuevoPlan.fechaInicio" (click)="asignar()"></button>
        </div>
      </div>
    </p-dialog>
    <p-dialog header="Terminar vigencia del plan" [visible]="!!terminando()" (visibleChange)="!$event && terminando.set(null)" [modal]="true" [style]="{ width: '380px', maxWidth: '95vw' }">
      <div class="lm-col" style="gap:12px;">
        <span>Plan <strong>{{ terminando()?.codPlan }}</strong></span>
        <label class="lm-col" style="gap:4px;">Fecha de término *<input pInputText type="date" [(ngModel)]="fechaTermino" /></label>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton label="Cancelar" [text]="true" (click)="terminando.set(null)"></button>
          <button pButton label="Terminar" icon="pi pi-check" [disabled]="!fechaTermino" (click)="terminar()"></button>
        </div>
      </div>
    </p-dialog>
    <ng-template #cargando><p class="lm-muted">Cargando…</p></ng-template>
  `,
})
export class AfiliadoDetailComponent implements OnInit {
  private api = inject(AfiliadosApiService);
  private route = inject(ActivatedRoute);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);
  private planesApi = inject(PlanesApiService);
  protected editando = signal(false);
  protected asignando = signal(false);
  protected terminando = signal<PlanAfiliadoDetalle | null>(null);
  protected planes = signal<Plan[]>([]);
  protected nuevoPlan = { codPlan: "", fechaInicio: "", fechaTermino: "" };
  protected fechaTermino = "";
  protected afiliado = signal<AfiliadoConPlanes | null>(null);
  protected cargas = signal<CargaAfiliado[]>([]);
  protected bienes = signal<BienAfiliado[]>([]);

  private id = "";

  ngOnInit() {
    const id = (this.id = this.route.snapshot.paramMap.get("id")!);
    const error = (err: { error?: { message?: string }; message: string }) =>
      this.msg.add({ severity: "error", summary: "No se pudo cargar el afiliado", detail: err.error?.message ?? err.message, life: 5000 });
    this.recargar();
    this.api.cargas(id).subscribe({ next: (c) => this.cargas.set(c), error });
    this.api.bienes(id).subscribe({ next: (b) => this.bienes.set(b), error });
  }

  private recargar() {
    this.api.obtener(this.id).subscribe({
      next: (a) => this.afiliado.set(a),
      error: (err) => this.fallo("No se pudo cargar el afiliado", err),
    });
  }

  private fallo(summary: string, err: { error?: { message?: string }; message: string }) {
    this.msg.add({ severity: "error", summary, detail: err.error?.message ?? err.message, life: 6000 });
  }

  protected editado() {
    this.editando.set(false);
    this.recargar();
  }

  protected eliminar(a: AfiliadoConPlanes) {
    this.confirm.confirm({
      header: "Eliminar afiliado",
      message: `¿Eliminar a ${a.nombres} ${a.apellidoPaterno} (${a.rut})? Queda registrado y puede restaurarse.`,
      acceptLabel: "Eliminar",
      rejectLabel: "Cancelar",
      acceptButtonStyleClass: "p-button-danger",
      accept: () =>
        this.api.eliminar(a.id).subscribe({
          next: () => {
            this.msg.add({ severity: "success", summary: "Afiliado eliminado", life: 3000 });
            this.recargar();
          },
          error: (err) => this.fallo("No se pudo eliminar", err),
        }),
    });
  }

  protected restaurar(a: AfiliadoConPlanes) {
    this.api.restaurar(a.id).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Afiliado restaurado", life: 3000 });
        this.recargar();
      },
      error: (err) => this.fallo("No se pudo restaurar", err),
    });
  }

  protected abrirAsignar() {
    this.nuevoPlan = { codPlan: "", fechaInicio: hoyChile(), fechaTermino: "" };
    if (!this.planes().length) this.planesApi.listar().subscribe((p) => this.planes.set(p));
    this.asignando.set(true);
  }

  protected asignar() {
    const { codPlan, fechaInicio, fechaTermino } = this.nuevoPlan;
    this.api.asignarPlan(this.id, { codPlan, fechaInicio, fechaTermino: fechaTermino || null }).subscribe({
      next: () => {
        this.asignando.set(false);
        this.msg.add({ severity: "success", summary: "Plan asignado", detail: codPlan, life: 3000 });
        this.recargar();
      },
      error: (err) => this.fallo("No se pudo asignar el plan", err),
    });
  }

  protected abrirTermino(p: PlanAfiliadoDetalle) {
    this.fechaTermino = hoyChile();
    this.terminando.set(p);
  }

  protected terminar() {
    const p = this.terminando();
    if (!p) return;
    this.api.terminarPlan(this.id, p.codPlan, this.fechaTermino).subscribe({
      next: () => {
        this.terminando.set(null);
        this.msg.add({ severity: "success", summary: "Vigencia terminada", detail: p.codPlan, life: 3000 });
        this.recargar();
      },
      error: (err) => this.fallo("No se pudo terminar el plan", err),
    });
  }

  protected parentesco(p: Parentesco | null): string {
    return p ? PARENTESCO_LABEL[p] : "—";
  }

  protected tipoBien(t: string): string {
    return TIPO_BIEN[t] ?? t;
  }
}

// Fecha de hoy en Chile (AAAA-MM-DD), para prellenar fechas de vigencia.
function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
