import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { UsuariosAdminService, UsuarioAdmin } from "../../core/services/usuarios-admin.service";
import type { TableLazyLoadEvent } from "primeng/table";

const ROLES = ["Administrador", "Supervisor", "Abogado", "Operador", "Auditor"] as const;

@Component({
  selector: "lm-admin-usuarios",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    TableModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    ToggleSwitchModule,
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
    <p-card>
      <ng-template pTemplate="header">
        <div style="padding:16px 16px 0;">
          <h2 style="margin:0;">Administración de usuarios</h2>
          <small class="lm-muted">Cambios sincronizados con Entra ID en el siguiente login</small>
        </div>
      </ng-template>

      <div class="lm-row" style="margin-bottom:16px;">
        <input
          pInputText
          type="text"
          [(ngModel)]="q"
          (keyup.enter)="recargar()"
          placeholder="Buscar (nombre o email)"
          style="flex:1; min-width:220px;"
        />
        <p-select
          [(ngModel)]="filtroRol"
          (onChange)="recargar()"
          [options]="rolOpts"
          optionLabel="label"
          optionValue="value"
          placeholder="Rol"
          [showClear]="true"
          [style]="{ 'min-width': '160px' }"
        ></p-select>
        <p-select
          [(ngModel)]="filtroActivo"
          (onChange)="recargar()"
          [options]="activoOpts"
          optionLabel="label"
          optionValue="value"
          placeholder="Estado"
          [showClear]="true"
          [style]="{ 'min-width': '140px' }"
        ></p-select>
        <span class="lm-grow"></span>
        <span class="lm-muted">{{ total() }} resultados</span>
      </div>

      <p-table
        [value]="data()"
        [lazy]="true"
        (onLazyLoad)="onLazy($event)"
        [paginator]="true"
        [rows]="pageSize()"
        [totalRecords]="total()"
        [rowsPerPageOptions]="[25, 50, 100]"
        [loading]="loading()"
        [first]="(page() - 1) * pageSize()"
        styleClass="p-datatable-sm"
      >
        <ng-template pTemplate="header">
          <tr>
            <th>Email</th>
            <th>Rol</th>
            <th>Planes</th>
            <th>Activo</th>
            <th>Último login</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-u>
          <tr>
            <td>
              <div>{{ u.email }}</div>
              <small class="lm-muted">{{ u.nombre }}</small>
            </td>
            <td>
              <p-select
                [ngModel]="u.rol"
                (onChange)="cambiarRol(u, $event.value)"
                [options]="rolOpts"
                optionLabel="label"
                optionValue="value"
                [style]="{ width: '160px' }"
                appendTo="body"
              ></p-select>
            </td>
            <td>
              <p-tag *ngFor="let p of u.codPlanes" [value]="p" severity="secondary" styleClass="lm-mr-4" [style]="{ 'margin-right': '4px' }"></p-tag>
            </td>
            <td>
              <p-toggleSwitch [ngModel]="u.activo" (onChange)="cambiarActivo(u, $event.checked)"></p-toggleSwitch>
            </td>
            <td>{{ u.ultimoLogin ? (u.ultimoLogin | date: 'short') : '—' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" style="text-align:center; padding:24px;" class="lm-muted">Sin usuarios.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class AdminUsuariosComponent implements OnInit {
  private api = inject(UsuariosAdminService);
  private msg = inject(MessageService);

  protected data = signal<UsuarioAdmin[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected q = "";
  protected filtroRol: string | undefined;
  protected filtroActivo: boolean | undefined;
  protected rolOpts = ROLES.map((r) => ({ label: r, value: r }));
  protected activoOpts = [
    { label: "Activos", value: true },
    { label: "Inactivos", value: false },
  ];

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api
      .listar({
        page: this.page(),
        pageSize: this.pageSize(),
        q: this.q || undefined,
        rol: this.filtroRol,
        activo: this.filtroActivo,
      })
      .subscribe({
        next: (res) => {
          this.data.set(res.data);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onLazy(ev: TableLazyLoadEvent) {
    const first = ev.first ?? 0;
    const rows = ev.rows ?? this.pageSize();
    this.page.set(Math.floor(first / rows) + 1);
    this.pageSize.set(rows);
    this.recargar();
  }

  cambiarRol(u: UsuarioAdmin, rol: string) {
    this.api.actualizar(u.id, { rol }).subscribe({
      next: () => this.msg.add({ severity: "success", summary: `${u.email} → ${rol}`, life: 2000 }),
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }

  cambiarActivo(u: UsuarioAdmin, activo: boolean) {
    this.api.actualizar(u.id, { activo }).subscribe({
      next: () => this.msg.add({ severity: "success", summary: `${u.email} ${activo ? "activado" : "desactivado"}`, life: 2000 }),
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }
}
