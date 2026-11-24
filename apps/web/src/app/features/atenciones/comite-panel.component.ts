import { Component, Input, OnChanges, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { TagModule } from "primeng/tag";
import { SelectModule } from "primeng/select";
import { InputTextModule } from "primeng/inputtext";
import { MessageService } from "primeng/api";
import type { BitacoraComite, ComiteConParticipantes as Comite, CompromisoComite } from "@legalmene/shared";
import { ComitesApiService } from "../../core/services/comites.service";
import { UsuariosAdminService, type UsuarioOpcion } from "../../core/services/usuarios-admin.service";
import { MeService } from "../../core/services/me.service";
import { PromptService } from "../../shared/prompt.service";

interface NuevoCompromiso {
  descripcion: string;
  responsableId: string | null;
  fechaCompromiso: string;
}

const ABIERTO = ["Convocado", "EnSesion"];

// Comités de una atención como bitácora (Anexo §VII l.951, §VIII l.1142): compromisos con
// responsable y plazo, validados (cumplido o no) en el comité siguiente.
@Component({
  selector: "lm-comite-panel",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TagModule, SelectModule, InputTextModule],
  template: `
    <div class="lm-row" style="margin-bottom:12px;" *ngIf="me.tiene('comites.convocar')">
      <button pButton [outlined]="true" label="Convocar comité" icon="pi pi-users" (click)="convocar()"></button>
    </div>
    <p *ngIf="!comites().length" class="lm-muted">Sin comités.</p>

    <section *ngFor="let c of comites()" class="lm-comite" [attr.data-testid]="'comite-' + c.id">
      <div class="lm-row" style="flex-wrap:wrap;">
        <strong>Comité del {{ c.fechaConvocatoria | date: 'short' }}</strong>
        <p-tag [value]="c.estado" [severity]="abierto(c) ? 'warn' : 'secondary'"></p-tag>
        <p-tag *ngIf="!abierto(c)" [value]="c.decision"></p-tag>
        <span class="lm-grow"></span>
        <ng-container *ngIf="abierto(c) && me.tiene('comites.convocar')">
          <p-select [(ngModel)]="decisiones[c.id]" [options]="decisionOpts" optionLabel="label" optionValue="value" placeholder="Decisión"
            appendTo="body" size="small" [style]="{ 'min-width': '150px' }"></p-select>
          <button pButton size="small" label="Cerrar comité" icon="pi pi-lock" [outlined]="true" [disabled]="!decisiones[c.id]" (click)="cerrar(c)"></button>
        </ng-container>
      </div>
      <p class="lm-small" style="margin:8px 0;">{{ c.motivo }}</p>
      <div class="lm-votos" data-testid="votos">
        <span *ngFor="let p of c.participantes" class="lm-small">
          {{ p.nombre }}<span class="lm-muted"> ({{ p.rol }})</span>: <strong>{{ etiquetaVoto(p.voto) }}</strong>
        </span>
      </div>
      <div *ngIf="abierto(c) && miVoto(c) !== null" class="lm-row" style="gap:4px; margin-bottom:8px; flex-wrap:wrap;">
        <span class="lm-small lm-muted">Su voto:</span>
        <button pButton size="small" [text]="miVoto(c) !== 'AFavor'" label="A favor" (click)="votar(c, 'AFavor')"></button>
        <button pButton size="small" [text]="miVoto(c) !== 'EnContra'" severity="danger" label="En contra" (click)="votar(c, 'EnContra')"></button>
        <button pButton size="small" [text]="miVoto(c) !== 'Abstencion'" severity="secondary" label="Abstención" (click)="votar(c, 'Abstencion')"></button>
      </div>
      <p *ngIf="c.acta" class="lm-small lm-muted" style="margin:0 0 8px;">Acta: {{ c.acta }}</p>

      <ng-container *ngIf="bitacoras()[c.id] as b">
        <div *ngIf="b.anterioresPorValidar.length" class="lm-bloque">
          <h4>Compromisos de comités anteriores</h4>
          <div *ngFor="let k of b.anterioresPorValidar" class="lm-compromiso" data-testid="compromiso-anterior">
            <ng-container *ngTemplateOutlet="fila; context: { $implicit: k }"></ng-container>
            <span *ngIf="k.estado === 'Pendiente' && abierto(c) && me.tiene('comites.convocar')" class="lm-acciones">
              <button pButton size="small" label="Cumplido" severity="success" [text]="true" (click)="validar(c, k, 'Cumplido')"></button>
              <button pButton size="small" label="No cumplido" severity="danger" [text]="true" (click)="validar(c, k, 'NoCumplido')"></button>
            </span>
          </div>
        </div>

        <div class="lm-bloque">
          <h4>Compromisos de este comité</h4>
          <p *ngIf="!b.propios.length" class="lm-muted lm-small">Sin compromisos registrados.</p>
          <div *ngFor="let k of b.propios" class="lm-compromiso" data-testid="compromiso">
            <ng-container *ngTemplateOutlet="fila; context: { $implicit: k }"></ng-container>
          </div>
          <form *ngIf="abierto(c) && me.tiene('comites.votar')" class="lm-nuevo" (ngSubmit)="agregar(c)">
            <input pInputText name="descripcion" [(ngModel)]="nuevo(c.id).descripcion" placeholder="Compromiso o instrucción" class="lm-grow" />
            <p-select name="responsableId" [(ngModel)]="nuevo(c.id).responsableId" [options]="usuarios()" optionLabel="nombre" optionValue="id"
              placeholder="Responsable" [filter]="true" appendTo="body" [style]="{ 'min-width': '200px' }"></p-select>
            <input pInputText type="date" name="fechaCompromiso" [(ngModel)]="nuevo(c.id).fechaCompromiso" />
            <button pButton type="submit" label="Agregar" icon="pi pi-plus" size="small"
              [disabled]="!nuevo(c.id).descripcion.trim() || !nuevo(c.id).responsableId || !nuevo(c.id).fechaCompromiso"></button>
          </form>
        </div>
      </ng-container>
    </section>

    <ng-template #fila let-k>
      <span class="lm-grow">
        {{ k.descripcion }}
        <span class="lm-muted lm-small"> · {{ k.responsableNombre }} · plazo {{ k.fechaCompromiso | date: 'dd-MM-yyyy' }}</span>
        <span *ngIf="k.observacion" class="lm-muted lm-small"> · {{ k.observacion }}</span>
      </span>
      <p-tag [value]="etiqueta(k)" [severity]="severidad(k)"></p-tag>
    </ng-template>
  `,
  styles: [
    `
      .lm-comite { margin-bottom: 12px; padding: 12px; border: 1px solid var(--p-content-border-color, #e2e8f0); border-radius: 8px; }
      .lm-bloque h4 { margin: 12px 0 6px; font-size: 0.875rem; }
      .lm-compromiso { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--p-content-border-color, #f1f5f9); flex-wrap: wrap; }
      .lm-acciones { display: flex; gap: 4px; }
      .lm-votos { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
      .lm-nuevo { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
    `,
  ],
})
export class ComitePanelComponent implements OnChanges {
  private api = inject(ComitesApiService);
  private usuariosApi = inject(UsuariosAdminService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);
  protected me = inject(MeService);

  @Input({ required: true }) atencionId!: string;

  protected comites = signal<Comite[]>([]);
  protected bitacoras = signal<Record<string, BitacoraComite>>({});
  protected usuarios = signal<UsuarioOpcion[]>([]);
  private nuevos: Record<string, NuevoCompromiso> = {};
  protected decisiones: Record<string, "Aprobado" | "Rechazado" | "Diferido" | undefined> = {};
  protected decisionOpts = [
    { label: "Aprobado", value: "Aprobado" },
    { label: "Rechazado", value: "Rechazado" },
    { label: "Diferido", value: "Diferido" },
  ];

  ngOnChanges() {
    this.recargar();
    if (!this.usuarios().length) this.usuariosApi.opciones().subscribe((u) => this.usuarios.set(u));
  }

  abierto(c: Comite) {
    return ABIERTO.includes(c.estado);
  }

  nuevo(id: string): NuevoCompromiso {
    return (this.nuevos[id] ??= { descripcion: "", responsableId: this.me.user()?.id ?? null, fechaCompromiso: "" });
  }

  // Voto del usuario actual en el comité; null si no participa.
  miVoto(c: Comite): string | null {
    const yo = this.me.user()?.id;
    return c.participantes.find((p) => p.usuarioId === yo)?.voto ?? null;
  }

  etiquetaVoto(v: string) {
    return v === "AFavor" ? "a favor" : v === "EnContra" ? "en contra" : v === "Abstencion" ? "abstención" : "sin votar";
  }

  votar(c: Comite, voto: "AFavor" | "EnContra" | "Abstencion") {
    this.api.votar(c.id, { voto }).subscribe({ next: () => this.recargar(), error: (e) => this.error(e) });
  }

  etiqueta(k: CompromisoComite) {
    if (k.estado === "Cumplido") return "Cumplido";
    if (k.estado === "NoCumplido") return "No cumplido";
    return k.vencido ? "Vencido" : "Pendiente";
  }

  severidad(k: CompromisoComite) {
    if (k.estado === "Cumplido") return "success" as const;
    if (k.estado === "NoCumplido" || k.vencido) return "danger" as const;
    return "warn" as const;
  }

  recargar() {
    this.api.listar(this.atencionId).subscribe((cs) => {
      const orden = [...cs].sort((a, b) => b.fechaConvocatoria.localeCompare(a.fechaConvocatoria));
      this.comites.set(orden);
      for (const c of orden) this.api.bitacora(c.id).subscribe((b) => this.bitacoras.update((m) => ({ ...m, [c.id]: b })));
    });
  }

  async convocar() {
    const motivo = await this.prompt.open({ header: "Convocar comité", label: "Motivo", multiline: true, required: true });
    if (!motivo) return;
    this.api.convocar(this.atencionId, { motivo, participantesIds: [this.me.user()?.id ?? ""].filter(Boolean) }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Comité convocado", life: 2000 });
        this.recargar();
      },
      error: (e) => this.error(e),
    });
  }

  agregar(c: Comite) {
    const n = this.nuevo(c.id);
    this.api
      .agregarCompromiso(c.id, { descripcion: n.descripcion.trim(), responsableId: n.responsableId!, fechaCompromiso: n.fechaCompromiso })
      .subscribe({
        next: () => {
          delete this.nuevos[c.id];
          this.msg.add({ severity: "success", summary: "Compromiso registrado", life: 2000 });
          this.recargar();
        },
        error: (e) => this.error(e),
      });
  }

  async validar(c: Comite, k: CompromisoComite, estado: "Cumplido" | "NoCumplido") {
    const observacion = await this.prompt.open({
      header: estado === "Cumplido" ? "Compromiso cumplido" : "Compromiso no cumplido",
      label: "Observación (opcional)",
      multiline: true,
    });
    if (observacion === null) return;
    this.api.validarCompromiso(c.id, k.id, { estado, observacion: observacion || null }).subscribe({
      next: () => this.recargar(),
      error: (e) => this.error(e),
    });
  }

  async cerrar(c: Comite) {
    const acta = await this.prompt.open({ header: "Cerrar comité", label: "Acta (decisión e instrucciones)", multiline: true, required: true });
    if (!acta) return;
    const decision = this.decisiones[c.id];
    if (!decision) return;
    this.api.cerrar(c.id, { decision, acta }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Comité cerrado", life: 2000 });
        this.recargar();
      },
      error: (e) => this.error(e),
    });
  }

  private error(e: { error?: { message?: string }; message?: string }) {
    this.msg.add({ severity: "error", summary: "No se pudo completar", detail: e.error?.message ?? e.message, life: 5000 });
  }
}
