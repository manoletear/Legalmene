import { Component, OnChanges, computed, inject, input, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TableModule } from "primeng/table";
import { MessageService } from "primeng/api";
import {
  CALIDAD_HEREDERO_LABEL,
  CalidadHerederoEnum,
  faltantesCausante,
  type Causante,
  type CalidadHeredero,
  type HerederoInput,
  type PosesionEfectiva,
} from "@legalmene/shared";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { MeService } from "../../core/services/me.service";
import { descargarArchivo } from "../../shared/descarga";

// Causante y herederos de una posesión efectiva, con la ficha PDF interna.
@Component({
  selector: "lm-posesion-panel",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, SelectModule, TableModule],
  template: `
    <p-card *ngIf="posesion() as pe">
      <ng-template pTemplate="header">
        <div class="lm-row" style="padding:16px 16px 0;">
          <h3 style="margin:0; flex:1;">Posesión efectiva</h3>
          <button pButton icon="pi pi-file-pdf" label="Ficha de antecedentes (PDF)" [outlined]="true" size="small" (click)="ficha()"></button>
        </div>
      </ng-template>
      <small class="lm-muted">La ficha es un resumen interno para preparar el trámite; no es el formulario oficial del Registro Civil.</small>

      <h4 style="margin:16px 0 8px;">Causante</h4>
      <form class="lm-pe-grid" (ngSubmit)="guardarCausante()">
        <div class="lm-col" style="gap:4px;"><label class="lm-small">Nombre</label><input pInputText name="cn" [(ngModel)]="causante.causanteNombre" [disabled]="!editable()" /></div>
        <div class="lm-col" style="gap:4px;"><label class="lm-small">RUT</label><input pInputText name="cr" [(ngModel)]="causante.causanteRut" [disabled]="!editable()" placeholder="12.345.678-5" /></div>
        <div class="lm-col" style="gap:4px;"><label class="lm-small">Fecha de defunción</label><input pInputText type="date" name="cf" [(ngModel)]="causante.causanteFechaDefuncion" [disabled]="!editable()" /></div>
        <div class="lm-col" style="gap:4px;"><label class="lm-small">Último domicilio</label><input pInputText name="cd" [(ngModel)]="causante.causanteUltimoDomicilio" [disabled]="!editable()" /></div>
        <div class="lm-col" style="gap:4px;"><label class="lm-small">Comuna</label><input pInputText name="cc" [(ngModel)]="causante.causanteComuna" [disabled]="!editable()" /></div>
        <div class="lm-row" style="align-items:end;" *ngIf="editable()"><button pButton type="submit" label="Guardar causante" size="small"></button></div>
      </form>
      <small *ngIf="faltan().length" class="lm-muted">Falta para preparar la solicitud: {{ faltan().join(', ') }}.</small>

      <h4 style="margin:16px 0 8px;">Herederos ({{ pe.herederos.length }})</h4>
      <p-table [value]="pe.herederos" styleClass="p-datatable-sm">
        <ng-template pTemplate="header"><tr><th>RUT</th><th>Nombre</th><th>Calidad</th><th>Contacto</th><th></th></tr></ng-template>
        <ng-template pTemplate="body" let-h>
          <tr>
            <td>{{ h.rut }}</td><td>{{ h.nombre }}</td><td>{{ calidad(h.calidad) }}</td>
            <td class="lm-small">{{ h.domicilio }} {{ h.telefono }} {{ h.email }}</td>
            <td style="text-align:right;"><button *ngIf="editable()" pButton icon="pi pi-times" [text]="true" severity="danger" size="small" (click)="quitar(h.id)" aria-label="Quitar heredero"></button></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="lm-muted" style="text-align:center;">Sin herederos registrados.</td></tr></ng-template>
      </p-table>
      <form *ngIf="editable()" class="lm-pe-grid" style="margin-top:12px;" (ngSubmit)="agregar()">
        <div class="lm-col" style="gap:4px;"><label class="lm-small">RUT heredero</label><input pInputText name="hr" [(ngModel)]="nuevo.rut" /></div>
        <div class="lm-col" style="gap:4px;"><label class="lm-small">Nombre heredero</label><input pInputText name="hn" [(ngModel)]="nuevo.nombre" /></div>
        <div class="lm-col" style="gap:4px;"><label class="lm-small">Calidad</label>
          <p-select name="hc" [(ngModel)]="nuevo.calidad" [options]="calidadOpts" optionLabel="label" optionValue="value" appendTo="body"></p-select></div>
        <div class="lm-col" style="gap:4px;"><label class="lm-small">Domicilio</label><input pInputText name="hd" [(ngModel)]="nuevo.domicilio" /></div>
        <div class="lm-row" style="align-items:end;"><button pButton type="submit" icon="pi pi-plus" label="Agregar heredero" size="small"></button></div>
      </form>
    </p-card>
  `,
  styles: [`.lm-pe-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:10px; }`],
})
export class PosesionPanelComponent implements OnChanges {
  private api = inject(AtencionesApiService);
  private me = inject(MeService);
  private msg = inject(MessageService);

  readonly atencionId = input.required<string>();
  readonly cerrada = input(false);
  readonly correlativo = input("");

  protected posesion = signal<PosesionEfectiva | null>(null);
  protected causante: Causante = {};
  protected nuevo: HerederoInput = { rut: "", nombre: "", calidad: "Hijo" };
  protected calidadOpts = CalidadHerederoEnum.options.map((v) => ({ label: CALIDAD_HEREDERO_LABEL[v], value: v }));
  protected editable = computed(() => !this.cerrada() && this.me.tiene("posesiones.crear"));
  protected faltan = signal<string[]>([]);

  ngOnChanges() {
    this.api.posesion(this.atencionId()).subscribe({ next: (pe) => this.set(pe), error: (e) => this.error("No se pudo cargar la posesión", e) });
  }

  private set(pe: PosesionEfectiva) {
    this.posesion.set(pe);
    this.causante = {
      causanteNombre: pe.causanteNombre,
      causanteRut: pe.causanteRut,
      causanteFechaDefuncion: pe.causanteFechaDefuncion,
      causanteUltimoDomicilio: pe.causanteUltimoDomicilio,
      causanteComuna: pe.causanteComuna,
      observaciones: pe.observaciones,
    };
    this.faltan.set(faltantesCausante(pe));
  }

  private error(summary: string, err: { error?: { message?: string | string[] }; message: string }) {
    const m = err.error?.message;
    this.msg.add({ severity: "error", summary, detail: Array.isArray(m) ? m.join("; ") : (m ?? err.message), life: 6000 });
  }

  protected calidad(c: CalidadHeredero): string {
    return CALIDAD_HEREDERO_LABEL[c];
  }

  guardarCausante() {
    const limpio = Object.fromEntries(Object.entries(this.causante).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v])) as Causante;
    this.api.actualizarCausante(this.atencionId(), limpio).subscribe({
      next: (pe) => {
        this.set(pe);
        this.msg.add({ severity: "success", summary: "Causante guardado", life: 2500 });
      },
      error: (e) => this.error("No se pudo guardar el causante", e),
    });
  }

  agregar() {
    if (!this.nuevo.rut || !this.nuevo.nombre) {
      this.msg.add({ severity: "warn", summary: "Faltan datos", detail: "Ingrese RUT y nombre del heredero", life: 3000 });
      return;
    }
    this.api.agregarHeredero(this.atencionId(), { ...this.nuevo, domicilio: this.nuevo.domicilio || null }).subscribe({
      next: () => {
        this.nuevo = { rut: "", nombre: "", calidad: "Hijo" };
        this.ngOnChanges();
      },
      error: (e) => this.error("No se pudo agregar el heredero", e),
    });
  }

  quitar(id: string) {
    this.api.quitarHeredero(id).subscribe({ next: () => this.ngOnChanges(), error: (e) => this.error("No se pudo quitar el heredero", e) });
  }

  async ficha() {
    try {
      await descargarArchivo(`/atenciones/${this.atencionId()}/posesion.pdf`, `ficha-posesion-${this.correlativo() || this.atencionId()}.pdf`);
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo generar la ficha", detail: (e as Error).message, life: 6000 });
    }
  }
}
