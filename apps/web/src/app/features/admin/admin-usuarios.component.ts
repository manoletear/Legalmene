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
import { DialogModule } from "primeng/dialog";
import { MessageService } from "primeng/api";
import type { TableLazyLoadEvent } from "primeng/table";
import { CreateUsuarioAdminSchema, type Perfil, type UpdateUsuarioAdmin } from "@legalmene/shared";
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
    DialogModule,
  ],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Usuarios</h1>
        <small class="lm-muted">Perfil, cargo, jefatura directa y anexo de cada usuario. Quien se desactiva o bloquea no puede operar.</small>
      </div>
      <button pButton icon="pi pi-user-plus" label="Nuevo usuario" (click)="abrirNuevo()"></button>
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
            <th>Cargo</th>
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
              <input
                pInputText
                [ngModel]="u.cargo"
                (change)="guardar(u, { cargo: $any($event.target).value.trim() || null })"
                maxlength="100"
                style="width:160px;"
                aria-label="Cargo"
              />
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
          <tr><td colspan="8" style="text-align:center; padding:24px;" class="lm-muted">Sin usuarios.</td></tr>
        </ng-template>
      </p-table>
    </p-card>

    <p-dialog header="Nuevo usuario" [visible]="nuevoVisible()" (visibleChange)="nuevoVisible.set($event)" [modal]="true" [style]="{ width: '520px', maxWidth: '95vw' }">
      <form class="lm-col" style="gap:12px;" (ngSubmit)="crear()">
        <label class="lm-col" style="gap:4px;">Correo *<input pInputText type="email" name="email" [(ngModel)]="nuevo.email" /></label>
        <label class="lm-col" style="gap:4px;">Nombre *<input pInputText name="nombre" [(ngModel)]="nuevo.nombre" /></label>
        <label class="lm-col" style="gap:4px;">Cargo<input pInputText name="cargo" [(ngModel)]="nuevo.cargo" maxlength="100" placeholder="Ej. Abogado, Jefe de Asesorías" /></label>
        <label class="lm-col" style="gap:4px;">Perfil *
          <p-select name="perfilId" [(ngModel)]="nuevo.perfilId" [options]="perfilOptsVigentes()" optionLabel="label" optionValue="value" placeholder="Seleccione" appendTo="body"></p-select>
        </label>
        <label class="lm-col" style="gap:4px;">Jefatura
          <p-select name="jefeId" [(ngModel)]="nuevo.jefeId" [options]="jefeOpts('')" optionLabel="label" optionValue="value" [filter]="true" filterBy="label" [showClear]="true" placeholder="Sin jefatura" appendTo="body"></p-select>
        </label>
        <label class="lm-col" style="gap:4px;">Anexo<input pInputText name="anexo" [(ngModel)]="nuevo.anexo" maxlength="10" /></label>
        <small class="lm-muted">Ingresa con un enlace de acceso enviado a su correo. El perfil define qué puede hacer.</small>
        <p *ngIf="errorNuevo()" role="alert" style="color:var(--p-red-600,#c62828); margin:0;">{{ errorNuevo() }}</p>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton type="button" label="Cancelar" [text]="true" (click)="nuevoVisible.set(false)"></button>
          <button pButton type="submit" label="Crear usuario" icon="pi pi-check" [loading]="creando()"></button>
        </div>
      </form>
    </p-dialog>
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
  protected nuevoVisible = signal(false);
  protected creando = signal(false);
  protected errorNuevo = signal<string | null>(null);
  protected nuevo = { email: "", nombre: "", cargo: "", perfilId: "", jefeId: null as string | null, anexo: "" };
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

  abrirNuevo() {
    this.nuevo = { email: "", nombre: "", cargo: "", perfilId: "", jefeId: null, anexo: "" };
    this.errorNuevo.set(null);
    this.nuevoVisible.set(true);
  }

  crear() {
    const datos = {
      email: this.nuevo.email,
      nombre: this.nuevo.nombre,
      cargo: this.nuevo.cargo.trim() || null,
      perfilId: this.nuevo.perfilId,
      jefeId: this.nuevo.jefeId || null,
      anexo: this.nuevo.anexo.trim() || null,
    };
    const v = CreateUsuarioAdminSchema.safeParse(datos);
    if (!v.success) {
      const i = v.error.issues[0];
      const campo: Record<string, string> = { email: "Correo", nombre: "Nombre", perfilId: "Perfil", cargo: "Cargo", anexo: "Anexo" };
      this.errorNuevo.set(`${campo[String(i.path[0])] ?? i.path.join(".")}: ${i.message}`);
      return;
    }
    this.errorNuevo.set(null);
    this.creando.set(true);
    this.api.crear(v.data).subscribe({
      next: (u) => {
        this.creando.set(false);
        this.nuevoVisible.set(false);
        this.msg.add({ severity: "success", summary: "Usuario creado", detail: u.email, life: 3000 });
        this.api.opciones().subscribe((o) => this.opciones.set(o));
        this.recargar();
      },
      error: (err) => {
        this.creando.set(false);
        this.errorNuevo.set(err.error?.message ?? err.message);
      },
    });
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
