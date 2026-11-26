import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { ConfirmationService, MessageService } from "primeng/api";
import { environment } from "../../../environments/environment";

interface EstadoBuscador {
  habilitado: boolean;
  disponible: boolean;
  indices: { entidad: "atenciones" | "afiliados"; documentos: number | null; indexadoHasta: string | null }[];
}

// Estado del buscador de texto completo (OpenSearch, opcional). Sin él, las búsquedas usan la base.
@Component({
  selector: "lm-admin-buscador",
  standalone: true,
  imports: [CommonModule, CardModule, TableModule, TagModule, ButtonModule],
  template: `
    <h1 style="margin:0 0 4px;">Buscador</h1>
    <p class="lm-muted" style="margin:0 0 16px;">
      Búsqueda de texto completo de atenciones y afiliados (tolera tildes y errores de tipeo). Si no está configurado o no responde,
      las búsquedas siguen funcionando con la base de datos. Los cambios se indexan al guardar y cada minuto.
    </p>
    <p-card>
      <div class="lm-row" style="gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;" *ngIf="estado() as e">
        <p-tag *ngIf="!e.habilitado" value="No configurado: se usa la base de datos" severity="secondary" data-testid="estado-buscador"></p-tag>
        <p-tag *ngIf="e.habilitado && e.disponible" value="Activo" severity="success" data-testid="estado-buscador"></p-tag>
        <p-tag *ngIf="e.habilitado && !e.disponible" value="Sin respuesta: se usa la base de datos" severity="warn" data-testid="estado-buscador"></p-tag>
        <span class="lm-grow"></span>
        <button pButton icon="pi pi-refresh" label="Actualizar" class="p-button-text" (click)="cargar()"></button>
        <button pButton icon="pi pi-database" label="Reindexar todo" [disabled]="!e.habilitado || reindexando()" [loading]="reindexando()" (click)="reindexar()"></button>
      </div>
      <p-table [value]="estado()?.indices ?? []" [loading]="loading()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Índice</th><th>Documentos</th><th>Indexado hasta</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-i>
          <tr>
            <td>{{ i.entidad === 'atenciones' ? 'Atenciones' : 'Afiliados' }}</td>
            <td>{{ i.documentos === null ? 'sin datos' : (i.documentos | number) }}</td>
            <td>{{ i.indexadoHasta ? (i.indexadoHasta | date: 'dd-MM-yyyy HH:mm') : 'sin datos' }}</td>
          </tr>
        </ng-template>
      </p-table>
      <small class="lm-muted">Reindexar reconstruye los índices desde cero (tras cambiar el mapeo o crear un dominio nuevo); mientras corre, las búsquedas pueden quedar incompletas.</small>
    </p-card>
  `,
})
export class AdminBuscadorComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private confirm = inject(ConfirmationService);
  private base = `${environment.apiBaseUrl}/admin/busqueda`;
  protected estado = signal<EstadoBuscador | null>(null);
  protected loading = signal(false);
  protected reindexando = signal(false);

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading.set(true);
    this.http.get<EstadoBuscador>(`${this.base}/estado`).subscribe({
      next: (e) => {
        this.estado.set(e);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.msg.add({ severity: "error", summary: "No se pudo leer el estado", detail: e.error?.message ?? e.message, life: 5000 });
      },
    });
  }

  reindexar() {
    this.confirm.confirm({
      header: "Reindexar el buscador",
      message: "¿Reconstruir los índices de búsqueda desde cero? Mientras corre, las búsquedas pueden quedar incompletas.",
      icon: "pi pi-exclamation-triangle",
      acceptLabel: "Reindexar",
      rejectLabel: "Cancelar",
      accept: () => this.ejecutarReindexado(),
    });
  }

  private ejecutarReindexado() {
    this.reindexando.set(true);
    this.http.post<{ indexados: number }>(`${this.base}/reindexar`, {}).subscribe({
      next: (r) => {
        this.reindexando.set(false);
        this.msg.add({ severity: "success", summary: `Reindexado: ${r.indexados} registros`, life: 4000 });
        this.cargar();
      },
      error: (e) => {
        this.reindexando.set(false);
        this.msg.add({ severity: "error", summary: "No se pudo reindexar", detail: e.error?.message ?? e.message, life: 6000 });
      },
    });
  }
}
