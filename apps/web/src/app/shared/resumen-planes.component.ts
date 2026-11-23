import { Component, Input, OnChanges, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { TagModule } from "primeng/tag";
import type { CoberturaConMaestros, ResumenPlanCobertura } from "@legalmene/shared";
import { CoberturasApiService } from "../core/services/coberturas.service";
import { PermisoDirective } from "../core/permisos";

const TIPO: Record<string, string> = { Consulta: "Consulta", Asesoria: "Asesoría", Juicio: "Juicio", PosesionEfectiva: "Posesión efectiva" };

// Planes vigentes con sus RUT vigentes, coberturas y materias (Anexo §XI l.1926–1955).
// Se usa en la búsqueda de afiliados (por plan o canal) y en la ficha del afiliado.
@Component({
  selector: "lm-resumen-planes",
  standalone: true,
  imports: [CommonModule, RouterLink, TagModule, PermisoDirective],
  template: `
    <section class="lm-resumen-planes" *ngIf="cargado()" data-testid="resumen-planes">
      <h3>{{ titulo }}</h3>
      <p *ngIf="planes().length === 0" class="lm-muted">Sin planes vigentes.</p>
      <p *ngIf="planes().length > 1" class="lm-small lm-muted">
        {{ planes().length }} planes vigentes · {{ totalRuts() }} RUT vigentes
      </p>
      <details *ngFor="let p of planes()" [open]="planes().length === 1">
        <summary>
          <strong>{{ p.codPlan }}</strong> — {{ p.nombre }}
          <span class="lm-muted" *ngIf="p.canalNombre"> · {{ p.canalNombre }}</span>
          <p-tag [value]="p.rutsVigentes + ' RUT vigentes'" severity="info" [style]="{ 'margin-left': '8px' }"></p-tag>
        </summary>
        <table class="lm-tabla-coberturas" *ngIf="p.coberturas.length; else sinReglas">
          <thead><tr><th>Competencia</th><th>Materia</th><th>Tipo</th><th>Cobertura</th></tr></thead>
          <tbody>
            <tr *ngFor="let c of p.coberturas">
              <td>{{ c.competenciaNombre ?? "—" }}</td>
              <td>{{ c.materiaNombre ?? "Todas las materias" }}</td>
              <td>{{ c.tipo ? tipo(c.tipo) : "Todos" }}</td>
              <td>{{ cobertura(c) }}</td>
            </tr>
          </tbody>
        </table>
        <ng-template #sinReglas><p class="lm-muted lm-small">Sin reglas de cobertura: se cobra el arancel completo.</p></ng-template>
        <a *lmPermiso="'coberturas.administrar'" [routerLink]="['/admin/coberturas']" [queryParams]="{ plan: p.codPlan }" class="lm-small">Editar coberturas</a>
      </details>
    </section>
  `,
  styles: [
    `
      .lm-resumen-planes { margin-top: 16px; }
      .lm-resumen-planes h3 { margin: 0 0 8px; font-size: 1rem; }
      details { border: 1px solid var(--p-content-border-color, #e0e0e0); border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; }
      summary { cursor: pointer; }
      .lm-tabla-coberturas { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 0.875rem; }
      .lm-tabla-coberturas th, .lm-tabla-coberturas td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--p-content-border-color, #eee); }
    `,
  ],
})
export class ResumenPlanesComponent implements OnChanges {
  private api = inject(CoberturasApiService);

  @Input() codPlan?: string;
  @Input() canalId?: string;
  @Input() afiliadoId?: string;
  @Input() titulo = "Planes vigentes y coberturas";
  // Cambiarlo vuelve a consultar (p. ej. tras asignar o terminar un plan).
  @Input() refresco?: unknown;

  protected planes = signal<ResumenPlanCobertura[]>([]);
  protected cargado = signal(false);
  protected totalRuts = () => this.planes().reduce((s, p) => s + p.rutsVigentes, 0);

  ngOnChanges() {
    this.cargado.set(false);
    if (!this.codPlan && !this.canalId && !this.afiliadoId) return;
    this.api.resumenPlanes({ codPlan: this.codPlan, canalId: this.canalId, afiliadoId: this.afiliadoId }).subscribe({
      next: (ps) => {
        this.planes.set(ps);
        this.cargado.set(true);
      },
      error: () => this.cargado.set(false),
    });
  }

  tipo(t: string) {
    return TIPO[t] ?? t;
  }

  cobertura(c: CoberturaConMaestros): string {
    if (c.modalidad === "Porcentaje") return `${c.porcentaje}% cubierto`;
    if (c.modalidad === "ValorUF") return `Paga UF ${((c.valorUfCentesimas ?? 0) / 100).toLocaleString("es-CL", { minimumFractionDigits: 2 })}`;
    return "Sin cobertura";
  }
}
