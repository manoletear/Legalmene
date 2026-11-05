import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { TagModule } from "primeng/tag";
import { TooltipModule } from "primeng/tooltip";
import { MessageService } from "primeng/api";
import type { TableLazyLoadEvent } from "primeng/table";
import type { AfiliadoConPlanes, PlanAfiliadoDetalle } from "@legalmene/shared";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { CriteriosBusquedaComponent, type Criterios } from "../../shared/criterios-busqueda.component";
import { descargarArchivo } from "../../shared/descarga";

// Búsqueda de afiliados por RUT, plan o canal (Anexo §XI B), sin precarga.
@Component({
  selector: "lm-afiliados-list",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CardModule, TableModule, ButtonModule, SelectModule, TagModule, TooltipModule, CriteriosBusquedaComponent],
  template: `
    <p-card>
      <ng-template pTemplate="header">
        <div style="padding:16px 16px 0;">
          <h2 style="margin:0;">Afiliados</h2>
        </div>
      </ng-template>

      <lm-criterios-busqueda
        [campos]="['rut', 'texto', 'plan', 'canal', 'bien']"
        [estados]="vigenciaOpts"
        [iniciales]="iniciales"
        etiquetaTexto="Nombre o correo"
        placeholderTexto="Pérez, juan@…"
        [exportable]="true"
        [puedeExportar]="!!criterios()"
        (buscar)="buscar($event)"
        (exportar)="exportar($event)"
        (limpiado)="limpiar()"
      ></lm-criterios-busqueda>

      <div *ngIf="!criterios(); else resultados" class="lm-vacio-busqueda">
        <i class="pi pi-search"></i>
        <p>Ingrese criterios y presione Buscar</p>
      </div>
      <ng-template #resultados>
        <p-table
          [value]="data()"
          [lazy]="true"
          (onLazyLoad)="onLazy($event)"
          [paginator]="true"
          [rows]="pageSize()"
          [totalRecords]="total()"
          [rowsPerPageOptions]="[10, 25, 50, 100]"
          [loading]="loading()"
          [first]="(page() - 1) * pageSize()"
          styleClass="p-datatable-sm"
          [style]="{ 'margin-top': '16px' }"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>RUT</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Planes</th>
              <th>Vigencia</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-a>
            <tr>
              <td><a [routerLink]="['/afiliados', a.id]" style="text-decoration:none; color:#1976d2;">{{ a.rut }}</a></td>
              <td>{{ a.apellidoPaterno }} {{ a.apellidoMaterno }}, {{ a.nombres }}</td>
              <td>{{ a.email }}</td>
              <td>
                <p-tag
                  *ngFor="let p of a.planes"
                  [value]="p.codPlan"
                  [severity]="p.vigente ? 'success' : 'secondary'"
                  [pTooltip]="detallePlan(p)"
                  [style]="{ 'margin-right': '4px' }"
                ></p-tag>
                <span *ngIf="a.planes.length === 0" class="lm-muted lm-small">Sin planes</span>
              </td>
              <td>{{ a.vigencia }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5" style="text-align:center; padding:24px;" class="lm-muted">Sin resultados para estos criterios.</td></tr>
          </ng-template>
        </p-table>
      </ng-template>
    </p-card>
  `,
})
export class AfiliadosListComponent implements OnInit {
  private api = inject(AfiliadosApiService);
  private route = inject(ActivatedRoute);
  private msg = inject(MessageService);
  protected data = signal<AfiliadoConPlanes[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected criterios = signal<Criterios | null>(null);
  protected iniciales: Criterios = {};
  protected vigenciaOpts = [
    { label: "Activo", value: "Activo" },
    { label: "Inactivo", value: "Inactivo" },
    { label: "Eliminado", value: "Eliminado" },
  ];

  ngOnInit() {
    // Llegar con ?rut= (desde la ficha de un caso) es una búsqueda explícita.
    const rut = this.route.snapshot.queryParamMap.get("rut");
    if (rut) {
      this.iniciales = { rut };
      this.buscar({ rut });
    }
  }

  detallePlan(p: PlanAfiliadoDetalle): string {
    const termino = p.fechaTermino ?? "sin término";
    return `${p.nombrePlan} · ${p.fechaInicio} → ${termino} · ${p.vigente ? "Vigente" : "No vigente"}`;
  }

  // El criterio "estado" del formulario es la vigencia del afiliado.
  private params(c: Criterios) {
    const { estado, ...resto } = c;
    return { ...resto, vigencia: estado };
  }

  buscar(c: Criterios) {
    this.criterios.set(c);
    this.page.set(1);
    this.recargar();
  }

  limpiar() {
    this.criterios.set(null);
    this.data.set([]);
  }

  private recargar() {
    const c = this.criterios();
    if (!c) return;
    this.loading.set(true);
    this.api.buscar({ ...this.params(c), page: this.page(), pageSize: this.pageSize() }).subscribe({
      next: (res) => {
        this.data.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.msg.add({ severity: "error", summary: "No se pudo buscar", detail: err.error?.message ?? err.message, life: 5000 });
      },
    });
  }

  onLazy(ev: TableLazyLoadEvent) {
    const rows = ev.rows ?? this.pageSize();
    const page = Math.floor((ev.first ?? 0) / rows) + 1;
    if (page === this.page() && rows === this.pageSize() && this.data().length) return;
    this.page.set(page);
    this.pageSize.set(rows);
    this.recargar();
  }

  async exportar(c: Criterios) {
    try {
      await descargarArchivo("/exports/busquedas/afiliados.xlsx", `afiliados-${new Date().toISOString().slice(0, 10)}.xlsx`, {
        params: this.params(c),
      });
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo exportar", detail: (e as Error).message, life: 6000 });
    }
  }
}
