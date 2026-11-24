import { Component, Input, OnChanges, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ButtonModule } from "primeng/button";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { TIPO_CITA_LABEL, type Cita } from "@legalmene/shared";
import { AgendaApiService } from "../../core/services/agenda.service";
import { PermisoDirective } from "../../core/permisos";
import { CitaDialogComponent } from "../../shared/cita-dialog.component";

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Citas de una atención (entrevistas, reuniones, audiencias) en su ficha.
@Component({
  selector: "lm-citas-atencion",
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, PermisoDirective, CitaDialogComponent],
  template: `
    <div class="lm-row" style="margin-bottom:12px;">
      <button *lmPermiso="'agenda.gestionar'" pButton [outlined]="true" icon="pi pi-calendar-plus" label="Agendar" (click)="abrir(null)"></button>
    </div>
    <p *ngIf="!citas().length" class="lm-muted">Sin citas agendadas para esta atención.</p>
    <div *ngFor="let c of citas()" class="lm-cita" data-testid="cita">
      <div class="lm-grow">
        <strong>{{ c.inicio | date: 'EEE dd-MM-yyyy HH:mm' }}</strong>
        <span class="lm-muted"> – {{ c.fin | date: 'HH:mm' }}</span>
        · {{ tipo(c) }}: {{ c.titulo }}
        <div class="lm-small lm-muted">{{ c.responsableNombre }}<span *ngIf="c.lugar"> · {{ c.lugar }}</span></div>
      </div>
      <p-tag [value]="c.estado" [severity]="c.estado === 'Programada' ? 'info' : c.estado === 'Realizada' ? 'success' : 'secondary'"></p-tag>
      <ng-container *ngIf="c.estado === 'Programada'">
        <span *lmPermiso="'agenda.gestionar'" style="display:flex; gap:4px;">
          <button pButton size="small" [text]="true" label="Reprogramar" (click)="abrir(c)"></button>
          <button pButton size="small" [text]="true" severity="success" label="Realizada" (click)="estado(c, 'Realizada')"></button>
          <button pButton size="small" [text]="true" severity="danger" label="Cancelar" (click)="estado(c, 'Cancelada')"></button>
        </span>
      </ng-container>
    </div>
    <lm-cita-dialog [visible]="dialogo()" [cita]="editando()" [atencionId]="atencionId" [responsableInicial]="abogadoId"
      (cerrar)="dialogo.set(false)" (guardada)="guardada()"></lm-cita-dialog>
  `,
  styles: [
    `
      .lm-cita { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--p-content-border-color, #f1f5f9); flex-wrap: wrap; }
    `,
  ],
})
export class CitasAtencionComponent implements OnChanges {
  private api = inject(AgendaApiService);
  private msg = inject(MessageService);

  @Input({ required: true }) atencionId!: string;
  @Input() abogadoId: string | null = null;

  protected citas = signal<Cita[]>([]);
  protected dialogo = signal(false);
  protected editando = signal<Cita | null>(null);

  ngOnChanges() {
    this.recargar();
  }

  tipo(c: Cita) {
    return TIPO_CITA_LABEL[c.tipo];
  }

  abrir(c: Cita | null) {
    this.editando.set(c);
    this.dialogo.set(true);
  }

  guardada() {
    this.dialogo.set(false);
    this.recargar();
  }

  estado(c: Cita, estado: "Realizada" | "Cancelada") {
    this.api.cambiarEstado(c.id, { estado }).subscribe({
      next: () => this.recargar(),
      error: (e) => this.msg.add({ severity: "error", summary: "No se pudo actualizar", detail: e.error?.message ?? e.message, life: 5000 }),
    });
  }

  private recargar() {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear() - 2, 0, 1);
    const hasta = new Date(hoy.getFullYear() + 3, 11, 31);
    this.api.listar({ desde: iso(desde), hasta: iso(hasta), atencionId: this.atencionId }).subscribe((c) => this.citas.set(c));
  }
}
