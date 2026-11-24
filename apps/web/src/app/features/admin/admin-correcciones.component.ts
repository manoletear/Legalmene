import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import type { PanoramaCorreccion } from "@legalmene/shared";
import { environment } from "../../../environments/environment";
import { PromptService } from "../../shared/prompt.service";

// Herramientas del administrador para corregir registros y retroceder flujos (Anexo §II l.156).
// Cada acción pide un motivo, que queda en la bitácora del flujo y en la auditoría.
@Component({
  selector: "lm-admin-correcciones",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, TagModule],
  template: `
    <h1 style="margin:0 0 4px;">Correcciones</h1>
    <p class="lm-muted" style="margin:0 0 16px;">
      Reabrir atenciones, reiniciar derivaciones y retroceder aranceles o provisiones un paso. Úselas solo para corregir errores:
      cada acción pide un motivo y queda registrada.
    </p>
    <p-card>
      <form class="lm-row" style="gap:8px; flex-wrap:wrap;" (ngSubmit)="buscar()">
        <input pInputText name="correlativo" [(ngModel)]="correlativo" placeholder="Correlativo (ej. ASES-2026-000012)" style="min-width:280px;" />
        <button pButton type="submit" icon="pi pi-search" label="Buscar" [disabled]="!correlativo.trim()"></button>
      </form>

      <div *ngIf="p() as p" style="margin-top:20px;" data-testid="panorama">
        <div class="lm-row" style="gap:8px; flex-wrap:wrap; align-items:center;">
          <strong>{{ p.atencion.correlativo }}</strong>
          <span class="lm-muted">{{ p.atencion.tipo }} · {{ p.atencion.asunto }}</span>
          <p-tag [value]="p.atencion.estado"></p-tag>
          <span class="lm-grow"></span>
          <button *ngIf="p.reabrible" pButton size="small" [outlined]="true" icon="pi pi-replay" label="Reabrir atención"
            (click)="accion('Reabrir atención', 'atenciones/' + p.atencion.id + '/reabrir')"></button>
        </div>

        <h4>Arancel</h4>
        <p *ngIf="!p.arancel" class="lm-muted lm-small">Sin arancel.</p>
        <div *ngIf="p.arancel as ar" class="lm-row" style="gap:8px; align-items:center;">
          <p-tag [value]="ar.estado"></p-tag>
          <button *ngIf="ar.retrocedeA" pButton size="small" [text]="true" icon="pi pi-undo" [label]="'Volver a ' + ar.retrocedeA"
            (click)="accion('Retroceder arancel', 'atenciones/' + p.atencion.id + '/arancel/retroceder')"></button>
        </div>

        <h4>Provisiones</h4>
        <p *ngIf="!p.provisiones.length" class="lm-muted lm-small">Sin provisiones.</p>
        <div *ngFor="let pr of p.provisiones" class="lm-row" style="gap:8px; align-items:center; padding:4px 0;">
          <span>{{ pr.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }} · {{ pr.motivo }}</span>
          <p-tag [value]="pr.estado"></p-tag>
          <button *ngIf="pr.retrocedeA" pButton size="small" [text]="true" icon="pi pi-undo" [label]="'Volver a ' + pr.retrocedeA"
            (click)="accion('Retroceder provisión', 'provisiones/' + pr.id + '/retroceder')"></button>
        </div>

        <h4>Derivaciones</h4>
        <p *ngIf="!p.derivaciones.length" class="lm-muted lm-small">Sin derivaciones.</p>
        <div *ngFor="let d of p.derivaciones" class="lm-row" style="gap:8px; align-items:center; padding:4px 0;">
          <span>A {{ d.nuevoTipo }}</span>
          <p-tag [value]="d.estado"></p-tag>
          <span *ngIf="d.atencionDerivadaCorrelativo" class="lm-muted lm-small">→ {{ d.atencionDerivadaCorrelativo }}</span>
          <button *ngIf="d.reiniciable" pButton size="small" [text]="true" icon="pi pi-refresh" label="Reiniciar derivación"
            (click)="accion('Reiniciar derivación', 'derivaciones/' + d.id + '/reiniciar')"></button>
        </div>
      </div>
    </p-card>
  `,
})
export class AdminCorreccionesComponent {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);
  private base = `${environment.apiBaseUrl}/correcciones`;

  protected correlativo = "";
  protected p = signal<PanoramaCorreccion | null>(null);

  buscar() {
    const c = this.correlativo.trim();
    if (!c) return;
    this.http.get<PanoramaCorreccion>(`${this.base}/atenciones/${encodeURIComponent(c)}`).subscribe({
      next: (r) => this.p.set(r),
      error: (e) => {
        this.p.set(null);
        this.msg.add({ severity: "warn", summary: "No encontrada", detail: e.error?.message ?? e.message, life: 4000 });
      },
    });
  }

  async accion(titulo: string, ruta: string) {
    const motivo = await this.prompt.open({ header: titulo, label: "Motivo de la corrección", multiline: true, required: true });
    if (!motivo) return;
    const req: Observable<unknown> = this.http.post(`${this.base}/${ruta}`, { motivo });
    req.subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: `${titulo}: hecho`, life: 3000 });
        this.buscar();
      },
      error: (e) => this.msg.add({ severity: "error", summary: `No se pudo: ${titulo.toLowerCase()}`, detail: e.error?.message ?? e.message, life: 6000 }),
    });
  }
}
