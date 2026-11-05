import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { MessageService } from "primeng/api";
import type { TableLazyLoadEvent } from "primeng/table";
import type { AtencionConMaestros, BusquedaExportable, TipoAtencion } from "@legalmene/shared";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { PermisoDirective } from "../../core/permisos";
import { ESTADO_OPCIONES, estadoSeverity as severidadEstado } from "../../shared/estado-atencion";
import { CriteriosBusquedaComponent, type Criterios } from "../../shared/criterios-busqueda.component";
import { descargarArchivo } from "../../shared/descarga";

const EXPORTACION: Record<string, BusquedaExportable> = {
  Consulta: "consultas",
  Asesoria: "asesorias",
  Juicio: "juicios",
};

// Búsqueda de atenciones (Anexo §XI A): no carga datos hasta que el usuario presiona "Buscar".
@Component({
  selector: "lm-atenciones-list",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    PermisoDirective,
    CardModule,
    TableModule,
    TagModule,
    ButtonModule,
    SelectModule,
    CriteriosBusquedaComponent,
  ],
  template: `
    <p-card>
      <ng-template pTemplate="header">
        <div style="display:flex; align-items:center; gap:8px; padding:16px 16px 0;">
          <h2 style="margin:0; flex:1;">{{ titulo }}</h2>
          <button *lmPermiso="['atenciones.crear_consulta', 'atenciones.crear_caso']" pButton icon="pi pi-plus" label="Nueva atención" routerLink="/atenciones/nueva"></button>
        </div>
      </ng-template>

      <lm-criterios-busqueda
        [campos]="['correlativo', 'rut', 'texto', 'abogado', 'plan', 'canal', 'competencia', 'materia', 'fechas']"
        [estados]="estadoOpts"
        [iniciales]="iniciales"
        etiquetaFecha="Apertura"
        etiquetaTexto="Asunto / descripción"
        placeholderTexto="Palabras del asunto o la materia"
        [exportable]="true"
        [puedeExportar]="!!criterios() && !!tipoExportacion()"
        (buscar)="buscar($event)"
        (exportar)="exportar($event)"
        (limpiado)="limpiar()"
      >
        <div *ngIf="!tipoBloqueado" class="lm-col" style="gap:4px;">
          <label class="lm-small">Tipo</label>
          <p-select [(ngModel)]="filtroTipo" name="tipo" [options]="tipoOpts" optionLabel="label" optionValue="value" placeholder="Todos" [showClear]="true" appendTo="body"></p-select>
        </div>
      </lm-criterios-busqueda>

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
              <th>Correlativo</th>
              <th>Tipo</th>
              <th>Materia</th>
              <th>Plan</th>
              <th>Estado</th>
              <th>Apertura</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-a>
            <tr>
              <td><a [routerLink]="['/atenciones', a.id]" style="text-decoration:none; color:#1976d2;">{{ a.correlativo }}</a></td>
              <td><p-tag [value]="a.tipo" [severity]="tipoSeverity(a.tipo)"></p-tag></td>
              <td>{{ a.asunto }} <small class="lm-muted">({{ a.materiaNombre }} · {{ a.competenciaNombre }})</small></td>
              <td>{{ a.codPlan }}</td>
              <td><p-tag [value]="a.estado" [severity]="estadoSeverity(a.estado)"></p-tag></td>
              <td>{{ a.fechaApertura | date: 'dd/MM/yyyy' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6" style="text-align:center; padding:24px;" class="lm-muted">Sin resultados para estos criterios.</td></tr>
          </ng-template>
        </p-table>
      </ng-template>
    </p-card>
  `,
})
export class AtencionesListComponent implements OnInit {
  private api = inject(AtencionesApiService);
  private route = inject(ActivatedRoute);
  private msg = inject(MessageService);
  protected data = signal<AtencionConMaestros[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected criterios = signal<Criterios | null>(null);
  protected tipoBloqueado = false;
  protected filtroTipo: TipoAtencion | undefined;
  protected iniciales: Criterios = {};

  protected tipoOpts = [
    { label: "Consulta", value: "Consulta" },
    { label: "Asesoría", value: "Asesoria" },
    { label: "Juicio", value: "Juicio" },
  ];
  protected estadoOpts = ESTADO_OPCIONES;
  protected estadoSeverity = severidadEstado;

  ngOnInit() {
    const tipoFiltro = this.route.snapshot.data["tipoFiltro"];
    if (tipoFiltro) {
      this.filtroTipo = tipoFiltro;
      this.tipoBloqueado = true;
    }
    // ?q= viene de la búsqueda global del encabezado: es una búsqueda explícita.
    const q = this.route.snapshot.queryParamMap.get("q");
    if (q) {
      this.iniciales = { q };
      this.buscar({ q });
    }
  }

  protected get titulo(): string {
    switch (this.filtroTipo) {
      case "Consulta": return "Consultas";
      case "Asesoria": return "Asesorías";
      case "Juicio": return "Juicios";
      default: return "Atenciones";
    }
  }

  protected tipoExportacion(): BusquedaExportable | undefined {
    return this.filtroTipo ? EXPORTACION[this.filtroTipo] : undefined;
  }

  buscar(c: Criterios) {
    this.criterios.set(c);
    this.page.set(1);
    this.recargar();
  }

  limpiar() {
    this.criterios.set(null);
    this.data.set([]);
    this.total.set(0);
  }

  private recargar() {
    const c = this.criterios();
    if (!c) return;
    this.loading.set(true);
    this.api.buscar({ ...c, tipo: this.filtroTipo, page: this.page(), pageSize: this.pageSize() }).subscribe({
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

  tipoSeverity(t: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" {
    return t === "Juicio" ? "danger" : t === "Asesoria" ? "warn" : "info";
  }

  async exportar(c: Criterios) {
    const tipo = this.tipoExportacion();
    if (!tipo) {
      this.msg.add({ severity: "warn", summary: "Elija un tipo", detail: "La exportación es por tipo de atención (consultas, asesorías o juicios)", life: 4000 });
      return;
    }
    try {
      await descargarArchivo(`/exports/busquedas/${tipo}.xlsx`, `${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx`, { params: { ...c } });
    } catch (e) {
      this.msg.add({ severity: "error", summary: "No se pudo exportar", detail: (e as Error).message, life: 6000 });
    }
  }
}
