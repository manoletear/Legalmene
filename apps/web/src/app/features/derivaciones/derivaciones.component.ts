import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import type { DerivacionRow } from "@legalmene/shared";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { MeService } from "../../core/services/me.service";
import { PromptService } from "../../shared/prompt.service";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

// Bandeja de derivaciones: la jefatura aprueba o rechaza las solicitudes de los abogados.
@Component({
  selector: "lm-derivaciones",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CardModule, SelectModule, ButtonModule, TableModule, TagModule],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Derivaciones</h1>
        <small class="lm-muted">Consultas que el abogado propone derivar a asesoría o juicio. Aprueba la jefatura del abogado.</small>
      </div>
      <p-select
        [(ngModel)]="filtroEstado"
        (onChange)="recargar()"
        [options]="estadoOpts"
        placeholder="Todos los estados"
        [showClear]="true"
        [style]="{ width: '200px' }"
      ></p-select>
    </div>

    <p-card>
      <p-table [value]="data()" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Consulta</th><th>Derivar a</th><th>Motivo</th><th>Estado</th><th>Solicitada por</th><th>Fecha</th><th></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-d>
          <tr>
            <td><a [routerLink]="['/atenciones', d.consultaId]" class="lm-mono">{{ d.consultaCorrelativo }}</a><div class="lm-small lm-muted">{{ d.asunto }}</div></td>
            <td>{{ d.nuevoTipo === 'Asesoria' ? 'Asesoría' : 'Juicio' }}</td>
            <td>{{ d.motivo }}<div *ngIf="d.observacion" class="lm-small lm-muted">{{ d.observacion }}</div></td>
            <td><p-tag [value]="d.estado" [severity]="severidad(d.estado)"></p-tag></td>
            <td class="lm-small">{{ d.solicitadaPorEmail }}</td>
            <td class="lm-small">{{ d.createdAt | date: 'dd/MM/yyyy' }}</td>
            <td style="text-align:right; white-space:nowrap;">
              <ng-container *ngIf="d.estado === 'Solicitada' && esJefatura()">
                <button pButton type="button" class="p-button-sm p-button-success p-button-text" label="Aprobar" (click)="aprobar(d)"></button>
                <button pButton type="button" class="p-button-sm p-button-danger p-button-text" label="Rechazar" (click)="rechazar(d)"></button>
              </ng-container>
              <a *ngIf="d.atencionDerivadaId" [routerLink]="['/atenciones', d.atencionDerivadaId]" class="lm-small">Ver atención →</a>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" style="text-align:center; padding:24px;" class="lm-muted">Sin derivaciones.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class DerivacionesComponent implements OnInit {
  private api = inject(AtencionesApiService);
  private me = inject(MeService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);

  protected data = signal<DerivacionRow[]>([]);
  protected loading = signal(false);
  protected filtroEstado: string | undefined = "Solicitada";
  protected estadoOpts = ["Solicitada", "Aprobada", "Rechazada"];
  protected esJefatura = computed(() => this.me.tiene("derivaciones.aprobar"));

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api.listarDerivaciones({ estado: this.filtroEstado, pageSize: 100 }).subscribe({
      next: (r) => {
        this.data.set(r.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private error(err: { error?: { message?: string }; message?: string }) {
    this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 6000 });
  }

  async aprobar(d: DerivacionRow) {
    const observacion = await this.prompt.open({ header: `Aprobar derivación de ${d.consultaCorrelativo}`, label: "Observación (opcional)", multiline: true });
    if (observacion === null) return;
    this.api.aprobarDerivacion(d.id, { observacion: observacion.trim() || undefined }).subscribe({
      next: (r) => {
        this.msg.add({ severity: "success", summary: "Derivación aprobada", detail: r.atencion.correlativo, life: 3000 });
        this.recargar();
      },
      error: (e) => this.error(e),
    });
  }

  async rechazar(d: DerivacionRow) {
    const observacion = await this.prompt.open({ header: `Rechazar derivación de ${d.consultaCorrelativo}`, label: "Motivo del rechazo", multiline: true, required: true });
    if (!observacion) return;
    this.api.rechazarDerivacion(d.id, observacion).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Derivación rechazada", life: 2500 });
        this.recargar();
      },
      error: (e) => this.error(e),
    });
  }

  severidad(e: string): Severity {
    if (e === "Aprobada") return "success";
    if (e === "Rechazada") return "danger";
    return "warn";
  }
}
