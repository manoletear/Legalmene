import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { CheckboxModule } from "primeng/checkbox";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { MessageService } from "primeng/api";
import { TIPO_CAMPO_LABEL, type CampoAdicional, type TipoAtencion, type TipoCampoAdicional } from "@legalmene/shared";
import { MaestrosApiService } from "../../core/services/maestros.service";
import { environment } from "../../../environments/environment";

interface Opcion {
  label: string;
  value: string;
}

// Anexo §XIII l.2396: solo el administrador agrega campos para ciertas materias o procedimientos.
@Component({
  selector: "lm-admin-campos-adicionales",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, TableModule, ButtonModule, InputTextModule, SelectModule, CheckboxModule, ToggleSwitchModule],
  template: `
    <h1 style="margin:0 0 4px;">Campos adicionales</h1>
    <p class="lm-muted" style="margin:0 0 12px;">
      Campos que se piden en la ficha de las atenciones de una materia o un procedimiento. Desactivar un campo lo oculta sin borrar lo ya registrado.
    </p>
    <p-card>
      <div class="lm-campos-form">
        <input pInputText name="etiqueta" [(ngModel)]="nuevo.etiqueta" placeholder="Nombre del campo" maxlength="120" aria-label="Nombre del campo" />
        <p-select [(ngModel)]="nuevo.tipoDato" [options]="tipoOpts" optionLabel="label" optionValue="value" ariaLabel="Tipo de dato" appendTo="body"></p-select>
        <input *ngIf="nuevo.tipoDato === 'Opcion'" pInputText name="opciones" [(ngModel)]="nuevo.opciones" placeholder="Opciones separadas por coma" aria-label="Opciones" />
        <p-select [(ngModel)]="nuevo.tipoAtencion" [options]="tipoAtencionOpts" optionLabel="label" optionValue="value" placeholder="Todos los tipos" [showClear]="true" ariaLabel="Tipo de atención" appendTo="body"></p-select>
        <p-select [(ngModel)]="nuevo.materiaId" [options]="materiaOpts()" optionLabel="label" optionValue="value" placeholder="Materia" [filter]="true" [showClear]="true" ariaLabel="Materia" appendTo="body"></p-select>
        <p-select [(ngModel)]="nuevo.procedimientoId" [options]="procedimientoOpts()" optionLabel="label" optionValue="value" placeholder="Procedimiento" [filter]="true" [showClear]="true" ariaLabel="Procedimiento" appendTo="body"></p-select>
        <label class="lm-row" style="gap:6px; align-items:center;"><p-checkbox [binary]="true" [(ngModel)]="nuevo.obligatorio" inputId="obligatorio"></p-checkbox> Obligatorio</label>
        <button pButton icon="pi pi-plus" label="Agregar campo" [disabled]="!nuevo.etiqueta.trim() || (!nuevo.materiaId && !nuevo.procedimientoId)" (click)="agregar()"></button>
      </div>
      <p-table [value]="campos()" styleClass="p-datatable-sm" [style]="{ 'margin-top': '12px' }">
        <ng-template pTemplate="header">
          <tr><th>Campo</th><th>Tipo</th><th>Aplica a</th><th>Obligatorio</th><th>Vigente</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-c>
          <tr>
            <td><strong>{{ c.etiqueta }}</strong><div *ngIf="c.opciones" class="lm-small lm-muted">{{ c.opciones.join(' · ') }}</div></td>
            <td>{{ tipoLabel(c.tipoDato) }}</td>
            <td class="lm-small">{{ aplicaA(c) }}</td>
            <td>{{ c.obligatorio ? 'Sí' : 'No' }}</td>
            <td><p-toggleSwitch [ngModel]="c.vigente" (onChange)="cambiarVigencia(c, $event.checked)" [ariaLabel]="'Vigente ' + c.etiqueta"></p-toggleSwitch></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="lm-muted" style="text-align:center;">Sin campos adicionales.</td></tr></ng-template>
      </p-table>
    </p-card>
  `,
  styles: [`.lm-campos-form { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:8px; align-items:center; }`],
})
export class AdminCamposAdicionalesComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private maestros = inject(MaestrosApiService);
  private base = `${environment.apiBaseUrl}/campos-adicionales`;
  protected campos = signal<CampoAdicional[]>([]);
  private materias = signal<{ id: string; nombre: string }[]>([]);
  private procedimientos = signal<{ id: string; nombre: string }[]>([]);
  protected materiaOpts = computed<Opcion[]>(() => this.materias().map((m) => ({ label: m.nombre, value: m.id })));
  protected procedimientoOpts = computed<Opcion[]>(() => this.procedimientos().map((p) => ({ label: p.nombre, value: p.id })));
  protected tipoOpts = (Object.entries(TIPO_CAMPO_LABEL) as [TipoCampoAdicional, string][]).map(([value, label]) => ({ label, value }));
  protected tipoAtencionOpts = [
    { label: "Consultas", value: "Consulta" },
    { label: "Asesorías", value: "Asesoria" },
    { label: "Juicios", value: "Juicio" },
    { label: "Posesiones efectivas", value: "PosesionEfectiva" },
  ];
  protected nuevo = this.vacio();

  private vacio() {
    return {
      etiqueta: "",
      tipoDato: "Texto" as TipoCampoAdicional,
      opciones: "",
      tipoAtencion: null as TipoAtencion | null,
      materiaId: null as string | null,
      procedimientoId: null as string | null,
      obligatorio: false,
    };
  }

  ngOnInit() {
    this.cargar();
    this.maestros.listar("materias").subscribe((m) => this.materias.set(m));
    this.maestros.listar("procedimientos").subscribe((p) => this.procedimientos.set(p));
  }

  private cargar() {
    this.http.get<CampoAdicional[]>(this.base, { params: { todos: "true" } }).subscribe((c) => this.campos.set(c));
  }

  protected tipoLabel(t: TipoCampoAdicional): string {
    return TIPO_CAMPO_LABEL[t];
  }

  protected aplicaA(c: CampoAdicional): string {
    const partes = [
      c.tipoAtencion ? (this.tipoAtencionOpts.find((t) => t.value === c.tipoAtencion)?.label ?? c.tipoAtencion) : "Todos los tipos",
      c.materiaId ? `Materia: ${this.materias().find((m) => m.id === c.materiaId)?.nombre ?? "—"}` : null,
      c.procedimientoId ? `Procedimiento: ${this.procedimientos().find((p) => p.id === c.procedimientoId)?.nombre ?? "—"}` : null,
    ];
    return partes.filter(Boolean).join(" · ");
  }

  protected agregar() {
    const n = this.nuevo;
    const body = {
      etiqueta: n.etiqueta.trim(),
      tipoDato: n.tipoDato,
      opciones: n.tipoDato === "Opcion" ? n.opciones.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
      obligatorio: n.obligatorio,
      tipoAtencion: n.tipoAtencion,
      materiaId: n.materiaId,
      procedimientoId: n.procedimientoId,
      orden: this.campos().length,
    };
    this.http.post<CampoAdicional>(this.base, body).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Campo agregado", life: 2500 });
        this.nuevo = this.vacio();
        this.cargar();
      },
      error: (e) => this.msg.add({ severity: "error", summary: "No se pudo agregar", detail: e.error?.message ?? e.message, life: 5000 }),
    });
  }

  protected cambiarVigencia(c: CampoAdicional, vigente: boolean) {
    this.http.patch<CampoAdicional>(`${this.base}/${c.id}`, { vigente }).subscribe({
      next: () => this.cargar(),
      error: (e) => this.msg.add({ severity: "error", summary: "No se pudo actualizar", detail: e.error?.message ?? e.message, life: 5000 }),
    });
  }
}
