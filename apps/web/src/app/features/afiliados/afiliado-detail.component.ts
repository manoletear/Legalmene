import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { MessageService } from "primeng/api";
import { PARENTESCO_LABEL, type AfiliadoConPlanes, type BienAfiliado, type CargaAfiliado, type Parentesco } from "@legalmene/shared";
import { AfiliadosApiService } from "../../core/services/afiliados.service";

const TIPO_BIEN: Record<string, string> = { Inmueble: "Inmueble", Vehiculo: "Vehículo", Otro: "Otro" };

// Ficha del afiliado: datos, planes con vigencia, cargas y bienes cubiertos por cada RUT–Plan.
@Component({
  selector: "lm-afiliado-detail",
  standalone: true,
  imports: [CommonModule, RouterLink, CardModule, TableModule, TagModule, ButtonModule],
  template: `
    <div *ngIf="afiliado() as a; else cargando">
      <div class="lm-row" style="margin-bottom:16px; align-items:flex-start;">
        <div style="flex:1;">
          <small class="lm-muted"><a routerLink="/afiliados">Afiliados</a> / {{ a.rut }}</small>
          <h1 style="margin:4px 0;">{{ a.nombres }} {{ a.apellidoPaterno }} {{ a.apellidoMaterno }}</h1>
          <span class="lm-muted">{{ a.rut }} · {{ a.email || 'sin correo' }} · {{ a.telefono || 'sin teléfono' }}</span>
        </div>
        <p-tag [value]="a.vigencia" [severity]="a.vigencia === 'Activo' ? 'success' : 'secondary'"></p-tag>
      </div>

      <p-card header="Planes" [style]="{ 'margin-bottom': '16px', display: 'block' }">
        <p-table [value]="a.planes" styleClass="p-datatable-sm">
          <ng-template pTemplate="header"><tr><th>Plan</th><th>Inicio</th><th>Término</th><th>Estado</th></tr></ng-template>
          <ng-template pTemplate="body" let-p>
            <tr>
              <td><strong>{{ p.codPlan }}</strong> <span class="lm-muted lm-small">{{ p.nombrePlan }}</span></td>
              <td>{{ p.fechaInicio }}</td>
              <td>{{ p.fechaTermino ?? 'sin término' }}</td>
              <td><p-tag [value]="p.vigente ? 'Vigente' : 'No vigente'" [severity]="p.vigente ? 'success' : 'secondary'"></p-tag></td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage"><tr><td colspan="4" class="lm-muted" style="text-align:center;">Sin planes.</td></tr></ng-template>
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
    <ng-template #cargando><p class="lm-muted">Cargando…</p></ng-template>
  `,
})
export class AfiliadoDetailComponent implements OnInit {
  private api = inject(AfiliadosApiService);
  private route = inject(ActivatedRoute);
  private msg = inject(MessageService);
  protected afiliado = signal<AfiliadoConPlanes | null>(null);
  protected cargas = signal<CargaAfiliado[]>([]);
  protected bienes = signal<BienAfiliado[]>([]);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get("id")!;
    const error = (err: { error?: { message?: string }; message: string }) =>
      this.msg.add({ severity: "error", summary: "No se pudo cargar el afiliado", detail: err.error?.message ?? err.message, life: 5000 });
    this.api.obtener(id).subscribe({ next: (a) => this.afiliado.set(a), error });
    this.api.cargas(id).subscribe({ next: (c) => this.cargas.set(c), error });
    this.api.bienes(id).subscribe({ next: (b) => this.bienes.set(b), error });
  }

  protected parentesco(p: Parentesco | null): string {
    return p ? PARENTESCO_LABEL[p] : "—";
  }

  protected tipoBien(t: string): string {
    return TIPO_BIEN[t] ?? t;
  }
}
