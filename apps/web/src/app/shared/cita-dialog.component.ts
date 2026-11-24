import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DialogModule } from "primeng/dialog";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TextareaModule } from "primeng/textarea";
import { MessageService } from "primeng/api";
import { TIPO_CITA_LABEL, TipoCitaEnum, type Cita, type TipoCita } from "@legalmene/shared";
import { AgendaApiService } from "../core/services/agenda.service";
import { UsuariosAdminService, type UsuarioOpcion } from "../core/services/usuarios-admin.service";
import { MeService } from "../core/services/me.service";

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const fechaLocal = (d: Date) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
const horaLocal = (d: Date) => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;

// Agendar o reprogramar una cita (Anexo §IV, §VI l.662, §VIII l.1130). La hora es la del navegador.
@Component({
  selector: "lm-cita-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, InputTextModule, SelectModule, TextareaModule],
  template: `
    <p-dialog [header]="cita ? 'Reprogramar cita' : 'Agendar cita'" [visible]="visible" (visibleChange)="!$event && cerrar.emit()"
      [modal]="true" [style]="{ width: '560px', maxWidth: '95vw' }">
      <form class="lm-form-grid" (ngSubmit)="guardar()">
        <label>Tipo
          <p-select name="tipo" [(ngModel)]="tipo" [options]="tipoOpts" optionLabel="label" optionValue="value" appendTo="body"></p-select>
        </label>
        <label>Responsable
          <p-select name="responsableId" [(ngModel)]="responsableId" [options]="usuarios()" optionLabel="nombre" optionValue="id"
            [filter]="true" appendTo="body" placeholder="Responsable"></p-select>
        </label>
        <label class="lm-span-2">Título<input pInputText name="titulo" [(ngModel)]="titulo" maxlength="200" /></label>
        <label>Fecha<input pInputText type="date" name="fecha" [(ngModel)]="fecha" /></label>
        <div class="lm-horas">
          <label>Desde<input pInputText type="time" name="horaInicio" [(ngModel)]="horaInicio" /></label>
          <label>Hasta<input pInputText type="time" name="horaFin" [(ngModel)]="horaFin" /></label>
        </div>
        <label class="lm-span-2">Lugar o enlace<input pInputText name="lugar" [(ngModel)]="lugar" maxlength="300" placeholder="Tribunal, oficina o enlace de videollamada" /></label>
        <label class="lm-span-2">Notas<textarea pTextarea name="notas" [(ngModel)]="notas" rows="2"></textarea></label>
        <p *ngIf="error()" class="lm-span-2 lm-error" role="alert">{{ error() }}</p>
        <div class="lm-span-2" style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton type="button" label="Cancelar" [text]="true" (click)="cerrar.emit()"></button>
          <button pButton type="submit" [label]="cita ? 'Guardar' : 'Agendar'" icon="pi pi-check" [loading]="guardando()"></button>
        </div>
      </form>
    </p-dialog>
  `,
  styles: [
    `
      .lm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .lm-form-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 0.875rem; }
      .lm-span-2 { grid-column: span 2; }
      .lm-horas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .lm-error { color: var(--p-red-600, #c62828); margin: 0; }
      @media (max-width: 560px) { .lm-form-grid { grid-template-columns: 1fr; } .lm-span-2 { grid-column: span 1; } }
    `,
  ],
})
export class CitaDialogComponent implements OnChanges {
  private api = inject(AgendaApiService);
  private usuariosApi = inject(UsuariosAdminService);
  private msg = inject(MessageService);
  private me = inject(MeService);

  @Input() visible = false;
  @Input() cita: Cita | null = null;
  @Input() atencionId: string | null = null;
  @Input() responsableInicial: string | null = null;
  @Input() fechaInicial: string | null = null;
  @Output() guardada = new EventEmitter<Cita>();
  @Output() cerrar = new EventEmitter<void>();

  protected usuarios = signal<UsuarioOpcion[]>([]);
  protected error = signal<string | null>(null);
  protected guardando = signal(false);
  protected tipoOpts = TipoCitaEnum.options.map((value) => ({ value, label: TIPO_CITA_LABEL[value] }));

  protected tipo: TipoCita = "Entrevista";
  protected titulo = "";
  protected fecha = "";
  protected horaInicio = "09:00";
  protected horaFin = "10:00";
  protected lugar = "";
  protected notas = "";
  protected responsableId: string | null = null;

  ngOnChanges() {
    if (!this.visible) return;
    if (!this.usuarios().length) this.usuariosApi.opciones().subscribe((u) => this.usuarios.set(u));
    this.error.set(null);
    const c = this.cita;
    if (c) {
      const ini = new Date(c.inicio);
      this.tipo = c.tipo;
      this.titulo = c.titulo;
      this.fecha = fechaLocal(ini);
      this.horaInicio = horaLocal(ini);
      this.horaFin = horaLocal(new Date(c.fin));
      this.lugar = c.lugar ?? "";
      this.notas = c.notas ?? "";
      this.responsableId = c.responsableId;
    } else {
      this.tipo = "Entrevista";
      this.titulo = "";
      this.fecha = this.fechaInicial ?? fechaLocal(new Date());
      this.horaInicio = "09:00";
      this.horaFin = "10:00";
      this.lugar = "";
      this.notas = "";
      this.responsableId = this.responsableInicial ?? this.me.user()?.id ?? null;
    }
  }

  guardar() {
    if (!this.titulo.trim() || !this.fecha || !this.horaInicio || !this.horaFin || !this.responsableId) {
      this.error.set("Complete tipo, responsable, título, fecha y horario");
      return;
    }
    const inicio = new Date(`${this.fecha}T${this.horaInicio}`);
    const fin = new Date(`${this.fecha}T${this.horaFin}`);
    if (fin <= inicio) {
      this.error.set("La hora de término debe ser posterior a la de inicio");
      return;
    }
    const datos = {
      tipo: this.tipo,
      titulo: this.titulo.trim(),
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      lugar: this.lugar.trim() || null,
      notas: this.notas.trim() || null,
      responsableId: this.responsableId,
    };
    this.guardando.set(true);
    const op = this.cita ? this.api.actualizar(this.cita.id, datos) : this.api.crear({ ...datos, atencionId: this.atencionId });
    op.subscribe({
      next: (c) => {
        this.guardando.set(false);
        this.msg.add({ severity: "success", summary: this.cita ? "Cita actualizada" : "Cita agendada", life: 2500 });
        this.guardada.emit(c);
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e.error?.message ?? e.message);
      },
    });
  }
}
