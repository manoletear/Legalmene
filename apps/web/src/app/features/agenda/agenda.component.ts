import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { CheckboxModule } from "primeng/checkbox";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { TIPO_CITA_LABEL, TIPOS_CITA_JUDICIAL, type Cita } from "@legalmene/shared";
import { AgendaApiService, paramsAgenda, type FiltroAgendaWeb } from "../../core/services/agenda.service";
import { UsuariosAdminService, type UsuarioOpcion } from "../../core/services/usuarios-admin.service";
import { MeService } from "../../core/services/me.service";
import { PermisoDirective } from "../../core/permisos";
import { CitaDialogComponent } from "../../shared/cita-dialog.component";
import { descargarArchivo } from "../../shared/descarga";

const dd = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

interface Dia {
  fecha: string;
  numero: number;
  delMes: boolean;
  citas: Cita[];
}

// Agenda por abogado y jefatura, con calendario mensual (Anexo §IV l.358, §VI l.662, §VIII l.1130).
// Cada usuario ve su agenda, la de su equipo o la de todos según su alcance de atenciones.
@Component({
  selector: "lm-agenda",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CardModule, ButtonModule, SelectModule, CheckboxModule, TagModule, PermisoDirective, CitaDialogComponent],
  template: `
    <p-card>
      <div class="lm-cabecera">
        <h2 style="margin:0;">Agenda</h2>
        <div class="lm-nav">
          <button pButton icon="pi pi-chevron-left" [text]="true" (click)="mover(-1)" aria-label="Mes anterior"></button>
          <strong class="lm-mes" data-testid="mes">{{ tituloMes() }}</strong>
          <button pButton icon="pi pi-chevron-right" [text]="true" (click)="mover(1)" aria-label="Mes siguiente"></button>
          <button pButton label="Hoy" [outlined]="true" size="small" (click)="irA(hoy)"></button>
        </div>
        <span class="lm-grow"></span>
        <p-select [(ngModel)]="responsableId" [options]="usuarios()" optionLabel="nombre" optionValue="id" placeholder="Todos los responsables visibles"
          [showClear]="true" [filter]="true" (onChange)="recargar()" [style]="{ 'min-width': '230px' }"></p-select>
        <label class="lm-small lm-check"><p-checkbox [(ngModel)]="soloJudicial" [binary]="true" (onChange)="recargar()"></p-checkbox> Solo audiencias y comparendos</label>
        <button pButton icon="pi pi-file-excel" label="Excel" [outlined]="true" (click)="exportar()"></button>
        <button *lmPermiso="'agenda.gestionar'" pButton icon="pi pi-calendar-plus" label="Agendar" (click)="abrir(null)"></button>
      </div>

      <div class="lm-calendario" role="grid" aria-label="Calendario mensual">
        <div class="lm-dow" *ngFor="let d of diasSemana">{{ d }}</div>
        <button type="button" *ngFor="let d of dias()" class="lm-dia" [class.lm-fuera]="!d.delMes" [class.lm-hoy]="d.fecha === hoy"
          [class.lm-sel]="d.fecha === seleccionado()" (click)="seleccionado.set(d.fecha)" [attr.data-fecha]="d.fecha">
          <span class="lm-num">{{ d.numero }}</span>
          <span *ngFor="let c of d.citas.slice(0, 3)" class="lm-chip" [class]="'lm-chip lm-' + c.tipo" [class.lm-cancelada]="c.estado === 'Cancelada'">
            {{ c.inicio | date: 'HH:mm' }} {{ c.titulo }}
          </span>
          <span *ngIf="d.citas.length > 3" class="lm-mas">+{{ d.citas.length - 3 }} más</span>
        </button>
      </div>

      <h3 style="margin:20px 0 8px;">{{ seleccionado() | date: "EEEE d 'de' MMMM" }}</h3>
      <p *ngIf="!delDia().length" class="lm-muted">Sin citas este día.</p>
      <div *ngFor="let c of delDia()" class="lm-cita" data-testid="cita-dia">
        <div class="lm-grow">
          <strong>{{ c.inicio | date: 'HH:mm' }}–{{ c.fin | date: 'HH:mm' }}</strong> · {{ tipo(c) }}: {{ c.titulo }}
          <div class="lm-small lm-muted">
            {{ c.responsableNombre }}<span *ngIf="c.lugar"> · {{ c.lugar }}</span>
            <span *ngIf="c.atencionCorrelativo"> · <a [routerLink]="['/atenciones', c.atencionId]">{{ c.atencionCorrelativo }}</a></span>
            <span *ngIf="c.afiliadoNombre"> · {{ c.afiliadoNombre }}</span>
          </div>
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
    </p-card>
    <lm-cita-dialog [visible]="dialogo()" [cita]="editando()" [fechaInicial]="seleccionado()" (cerrar)="dialogo.set(false)" (guardada)="guardada()"></lm-cita-dialog>
  `,
  styles: [
    `
      .lm-cabecera { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .lm-nav { display: flex; align-items: center; gap: 4px; }
      .lm-mes { min-width: 150px; text-align: center; text-transform: capitalize; }
      .lm-check { display: flex; align-items: center; gap: 6px; }
      .lm-calendario { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
      .lm-dow { font-size: 0.75rem; font-weight: 600; text-align: center; color: var(--p-text-muted-color, #64748b); padding: 4px 0; }
      .lm-dia { min-height: 92px; border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 6px; padding: 4px; text-align: left;
        background: var(--p-content-background, #fff); color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 2px; overflow: hidden; font: inherit; }
      .lm-dia.lm-fuera { opacity: 0.45; }
      .lm-dia.lm-hoy .lm-num { background: var(--p-primary-color, #2563eb); color: #fff; border-radius: 10px; padding: 0 6px; }
      .lm-dia.lm-sel { outline: 2px solid var(--p-primary-color, #2563eb); }
      .lm-num { font-size: 0.75rem; font-weight: 600; align-self: flex-start; }
      .lm-chip { font-size: 0.7rem; border-radius: 4px; padding: 1px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #e0f2fe; color: #075985; }
      .lm-chip.lm-Audiencia, .lm-chip.lm-Comparendo { background: #fee2e2; color: #991b1b; }
      .lm-chip.lm-Videollamada { background: #ede9fe; color: #5b21b6; }
      .lm-chip.lm-cancelada { text-decoration: line-through; opacity: 0.6; }
      .lm-mas { font-size: 0.7rem; color: var(--p-text-muted-color, #64748b); }
      .lm-cita { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--p-content-border-color, #f1f5f9); flex-wrap: wrap; }
      @media (max-width: 640px) { .lm-dia { min-height: 56px; } .lm-chip { display: none; } .lm-dia:has(.lm-chip)::after { content: "•"; color: var(--p-primary-color, #2563eb); } }
    `,
  ],
})
export class AgendaComponent implements OnInit {
  private api = inject(AgendaApiService);
  private usuariosApi = inject(UsuariosAdminService);
  private msg = inject(MessageService);
  private route = inject(ActivatedRoute);
  protected me = inject(MeService);

  protected hoy = isoLocal(new Date());
  protected diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  protected mes = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected seleccionado = signal(this.hoy);
  protected citas = signal<Cita[]>([]);
  protected usuarios = signal<UsuarioOpcion[]>([]);
  protected dialogo = signal(false);
  protected editando = signal<Cita | null>(null);
  protected responsableId: string | undefined;
  protected soloJudicial = false;

  protected tituloMes = computed(() => `${MESES[this.mes().getMonth()]} ${this.mes().getFullYear()}`);

  // Semanas completas de lunes a domingo que cubren el mes.
  private rango = computed(() => {
    const m = this.mes();
    const inicio = new Date(m);
    inicio.setDate(1 - ((m.getDay() + 6) % 7));
    const ultimo = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const fin = new Date(ultimo);
    fin.setDate(ultimo.getDate() + (6 - ((ultimo.getDay() + 6) % 7)));
    return { inicio, fin };
  });

  protected dias = computed<Dia[]>(() => {
    const { inicio, fin } = this.rango();
    const porDia = new Map<string, Cita[]>();
    for (const c of this.citas()) {
      const k = isoLocal(new Date(c.inicio));
      porDia.set(k, [...(porDia.get(k) ?? []), c]);
    }
    const out: Dia[] = [];
    for (const d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      const f = isoLocal(d);
      out.push({ fecha: f, numero: d.getDate(), delMes: d.getMonth() === this.mes().getMonth(), citas: porDia.get(f) ?? [] });
    }
    return out;
  });

  protected delDia = computed(() => this.dias().find((d) => d.fecha === this.seleccionado())?.citas ?? []);

  ngOnInit() {
    const fecha = this.route.snapshot.queryParamMap.get("fecha");
    this.usuariosApi.opciones().subscribe((u) => this.usuarios.set(u));
    this.irA(fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : this.hoy);
  }

  irA(fecha: string) {
    const [a, m] = fecha.split("-").map(Number);
    this.mes.set(new Date(a, m - 1, 1));
    this.seleccionado.set(fecha);
    this.recargar();
  }

  mover(n: number) {
    const m = this.mes();
    const nuevo = new Date(m.getFullYear(), m.getMonth() + n, 1);
    this.mes.set(nuevo);
    this.seleccionado.set(isoLocal(nuevo));
    this.recargar();
  }

  tipo(c: Cita) {
    return TIPO_CITA_LABEL[c.tipo];
  }

  private filtro(): FiltroAgendaWeb {
    const { inicio, fin } = this.rango();
    return {
      desde: isoLocal(inicio),
      hasta: isoLocal(fin),
      responsableId: this.responsableId,
      tipo: this.soloJudicial ? TIPOS_CITA_JUDICIAL : undefined,
    };
  }

  recargar() {
    this.api.listar(this.filtro()).subscribe({
      next: (c) => this.citas.set(c),
      error: (e) => this.msg.add({ severity: "error", summary: "No se pudo cargar la agenda", detail: e.error?.message ?? e.message, life: 5000 }),
    });
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

  // Calendario del mes en Excel (con "Solo audiencias", el calendario mensual de audiencias).
  async exportar() {
    const m = this.mes();
    const f = { ...this.filtro(), desde: isoLocal(m), hasta: isoLocal(new Date(m.getFullYear(), m.getMonth() + 1, 0)) };
    try {
      await descargarArchivo("/agenda/calendario.xlsx", `agenda-${f.desde.slice(0, 7)}.xlsx`, { params: paramsAgenda(f) });
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo exportar", detail: (e as Error).message, life: 5000 });
    }
  }
}
