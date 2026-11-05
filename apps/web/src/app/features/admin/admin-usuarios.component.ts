import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { MessageService } from "primeng/api";
import type { TableLazyLoadEvent } from "primeng/table";
import type { Perfil, UpdateUsuarioAdmin } from "@legalmene/shared";
import {
  PerfilesApiService,
  UsuarioAdmin,
  UsuarioOpcion,
  UsuariosAdminService,
} from "../../core/services/usuarios-admin.service";
import { PromptService } from "../../shared/prompt.service";

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
  ],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Usuarios</h1>
        <small class="lm-muted">Perfil, jefatura directa y anexo de cada usuario. Quien se desactiva o bloquea no puede operar.</small>
      </div>
    </div>

    <p-card>
      <div class="lm-row" style="margin-bottom:16px; flex-wrap:wrap;">
        <input
          pInputText
          type="text"
          [(ngModel)]="q"
          (keyup.enter)="recargar()"
          placeholder="Buscar (nombre o email)"
          style="flex:1; min-width:220px;"
        />
        <p-select
          [(ngModel)]="filtroPerfil"
          (onChange)="recargar()"
          [options]="perfilOpts()"
          optionLabel="label"
          optionValue="value"
          placeholder="Perfil"
          [showClear]="true"
          [style]="{ 'min-width': '200px' }"
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
            <th>Usuario</th>
            <th>Perfil</th>
            <th>Jefatura</th>
            <th>Anexo</th>
            <th>Activo</th>
            <th>Bloqueo</th>
            <th>Último ingreso</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-u>
          <tr>
            <td>
              <div>{{ u.nombre }}</div>
              <small class="lm-muted">{{ u.email }}</small>
            </td>
            <td>
              <p-select
                [ngModel]="u.perfilId"
                (onChange)="guardar(u, { perfilId: $event.value })"
                [options]="perfilOptsVigentes()"
                optionLabel="label"
                optionValue="value"
                [style]="{ width: '220px' }"
                appendTo="body"
              ></p-select>
            </td>
            <td>
              <p-select
                [ngModel]="u.jefeId"
                (onChange)="guardar(u, { jefeId: $event.value ?? null })"
                [options]="jefeOpts(u.id)"
                optionLabel="label"
                optionValue="value"
                [filter]="true"
                filterBy="label"
                [showClear]="true"
                placeholder="Sin jefatura"
                [style]="{ width: '200px' }"
                appendTo="body"
              ></p-select>
            </td>
            <td>
              <input
                pInputText
                [ngModel]="u.anexo"
                (change)="guardar(u, { anexo: $any($event.target).value || null })"
                maxlength="10"
                style="width:80px;"
                aria-label="Anexo telefónico"
              />
            </td>
            <td>
              <p-toggleSwitch [ngModel]="u.activo" (onChange)="guardar(u, { activo: $event.checked })"></p-toggleSwitch>
            </td>
            <td>
              <ng-container *ngIf="u.bloqueado; else libre">
                <p-tag value="Bloqueado" severity="danger"></p-tag>
                <div class="lm-small lm-muted" *ngIf="u.motivoBloqueo">{{ u.motivoBloqueo }}</div>
                <button pButton type="button" class="p-button-text p-button-sm" label="Desbloquear" (click)="bloquear(u, false)"></button>
              </ng-container>
              <ng-template #libre>
                <button pButton type="button" class="p-button-text p-button-sm p-button-danger" label="Bloquear" (click)="bloquear(u, true)"></button>
              </ng-template>
            </td>
            <td>{{ u.ultimoLogin ? (u.ultimoLogin | date: 'short') : '—' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" style="text-align:center; padding:24px;" class="lm-muted">Sin usuarios.</td></tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class AdminUsuariosComponent implements OnInit {
  private api = inject(UsuariosAdminService);
  private perfilesApi = inject(PerfilesApiService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);

  protected data = signal<UsuarioAdmin[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected perfiles = signal<Perfil[]>([]);
  protected opciones = signal<UsuarioOpcion[]>([]);
  protected q = "";
  protected filtroPerfil: string | undefined;
  protected filtroActivo: boolean | undefined;

  protected activoOpts = [
    { label: "Activos", value: true },
    { label: "Inactivos", value: false },
  ];
  protected perfilOpts = computed(() => this.perfiles().map((p) => ({ label: p.nombre, value: p.id })));
  protected perfilOptsVigentes = computed(() =>
    this.perfiles()
      .filter((p) => p.vigente)
      .map((p) => ({ label: p.nombre, value: p.id })),
  );

  protected jefeOpts(usuarioId: string) {
    return this.opciones()
      .filter((o) => o.id !== usuarioId)
      .map((o) => ({ label: `${o.nombre} (${o.email})`, value: o.id }));
  }

  ngOnInit() {
    this.perfilesApi.listar().subscribe((p) => this.perfiles.set(p));
    this.api.opciones().subscribe((o) => this.opciones.set(o));
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api
      .listar({ page: this.page(), pageSize: this.pageSize(), q: this.q || undefined, perfilId: this.filtroPerfil, activo: this.filtroActivo })
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
    const rows = ev.rows ?? this.pageSize();
    this.page.set(Math.floor((ev.first ?? 0) / rows) + 1);
    this.pageSize.set(rows);
    this.recargar();
  }

  guardar(u: UsuarioAdmin, patch: UpdateUsuarioAdmin) {
    this.api.actualizar(u.id, patch).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: `${u.nombre} actualizado`, life: 2000 });
        this.recargar();
      },
      error: (err) => {
        this.msg.add({ severity: "error", summary: "No se pudo guardar", detail: err.error?.message ?? err.message, life: 4000 });
        this.recargar();
      },
    });
  }

  async bloquear(u: UsuarioAdmin, bloqueado: boolean) {
    let motivo: string | undefined;
    if (bloqueado) {
      const r = await this.prompt.open({ header: `Bloquear a ${u.nombre}`, label: "Motivo del bloqueo", multiline: true, required: true });
      if (r === null) return;
      motivo = r.trim();
    }
    this.api.bloquear(u.id, bloqueado, motivo).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: bloqueado ? "Usuario bloqueado" : "Usuario desbloqueado", life: 2500 });
        this.recargar();
      },
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }
}
