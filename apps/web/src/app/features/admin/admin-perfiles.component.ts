import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { CheckboxModule } from "primeng/checkbox";
import { TagModule } from "primeng/tag";
import { MessageService } from "primeng/api";
import { MODULOS_PERMISOS, PERFIL_ADMIN, type Perfil, type Permiso } from "@legalmene/shared";
import { PerfilesApiService } from "../../core/services/usuarios-admin.service";
import { PromptService } from "../../shared/prompt.service";

interface GrupoPermisos {
  modulo: string;
  permisos: { clave: Permiso; etiqueta: string }[];
}

@Component({
  selector: "lm-admin-perfiles",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, CheckboxModule, TagModule],
  template: `
    <div class="lm-row" style="margin-bottom:16px; align-items:flex-end;">
      <div style="flex:1;">
        <h1 style="margin:0 0 4px 0;">Perfiles y permisos</h1>
        <small class="lm-muted">Cada perfil agrupa permisos por módulo y por acción. El Administrador del sistema siempre tiene todos.</small>
      </div>
      <button pButton type="button" icon="pi pi-plus" label="Nuevo perfil" (click)="nuevo()"></button>
    </div>

    <div style="display:grid; grid-template-columns: minmax(240px, 300px) 1fr; gap:16px; align-items:start;">
      <p-card>
        <div
          *ngFor="let p of perfiles()"
          class="lm-perfil-item"
          [class.activo]="p.id === seleccionadoId()"
          (click)="seleccionar(p)"
          style="padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;"
          [style.background]="p.id === seleccionadoId() ? '#eff6ff' : 'transparent'"
        >
          <div style="flex:1;">
            <div [style.fontWeight]="p.id === seleccionadoId() ? 600 : 400">{{ p.nombre }}</div>
            <small class="lm-muted">{{ p.codigo }} · {{ p.usuarios ?? 0 }} usuario(s)</small>
          </div>
          <p-tag *ngIf="!p.vigente" value="Inactivo" severity="secondary"></p-tag>
        </div>
      </p-card>

      <p-card *ngIf="seleccionado() as p">
        <div class="lm-row" style="margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div style="flex:1; min-width:240px;">
            <label class="lm-small lm-muted">Nombre</label>
            <input pInputText [(ngModel)]="nombre" style="width:100%;" />
          </div>
          <div style="flex:2; min-width:240px;">
            <label class="lm-small lm-muted">Descripción</label>
            <input pInputText [(ngModel)]="descripcion" style="width:100%;" />
          </div>
        </div>

        <div *ngIf="esAdmin()" class="lm-small" style="background:#f1f5f9; padding:8px 12px; border-radius:6px; margin-bottom:12px;">
          Este perfil tiene siempre todos los permisos, incluidos los que se agreguen en el futuro.
        </div>

        <div *ngFor="let g of grupos" style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px 0; font-size:15px;">{{ g.modulo }}</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:6px 16px;">
            <label *ngFor="let perm of g.permisos" style="display:flex; align-items:center; gap:8px; font-size:14px;">
              <p-checkbox
                [binary]="true"
                [ngModel]="esAdmin() || marcados().has(perm.clave)"
                (ngModelChange)="alternar(perm.clave, $event)"
                [disabled]="esAdmin()"
                [inputId]="'perm-' + perm.clave"
              ></p-checkbox>
              <span [attr.title]="perm.clave">{{ perm.etiqueta }}</span>
            </label>
          </div>
        </div>

        <div class="lm-row" style="justify-content:flex-end; gap:8px; border-top:1px solid #e2e8f0; padding-top:12px;">
          <button *ngIf="!p.esSistema" pButton type="button" class="p-button-text p-button-danger" label="Eliminar" (click)="eliminar(p)"></button>
          <button
            *ngIf="!esAdmin()"
            pButton
            type="button"
            class="p-button-outlined"
            [label]="p.vigente ? 'Desactivar' : 'Activar'"
            (click)="alternarVigente(p)"
          ></button>
          <button pButton type="button" class="p-button-outlined" label="Copiar como nuevo" (click)="nuevo(p)"></button>
          <button pButton type="button" label="Guardar" icon="pi pi-check" (click)="guardar(p)" [disabled]="guardando()"></button>
        </div>
      </p-card>
    </div>
  `,
})
export class AdminPerfilesComponent implements OnInit {
  private api = inject(PerfilesApiService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);

  protected perfiles = signal<Perfil[]>([]);
  protected seleccionadoId = signal<string | null>(null);
  protected marcados = signal<Set<Permiso>>(new Set());
  protected guardando = signal(false);
  protected nombre = "";
  protected descripcion = "";

  protected grupos: GrupoPermisos[] = MODULOS_PERMISOS.map((m) => ({
    modulo: m.modulo,
    permisos: Object.entries(m.permisos).map(([clave, etiqueta]) => ({ clave: clave as Permiso, etiqueta: etiqueta as string })),
  }));

  protected seleccionado = computed(() => this.perfiles().find((p) => p.id === this.seleccionadoId()) ?? null);
  protected esAdmin = computed(() => this.seleccionado()?.codigo === PERFIL_ADMIN);

  ngOnInit() {
    this.recargar();
  }

  private recargar(seleccionar?: string) {
    this.api.listar().subscribe((ps) => {
      this.perfiles.set(ps);
      const p = ps.find((x) => x.id === (seleccionar ?? this.seleccionadoId())) ?? ps[0];
      if (p) this.seleccionar(p);
    });
  }

  seleccionar(p: Perfil) {
    this.seleccionadoId.set(p.id);
    this.marcados.set(new Set(p.permisos));
    this.nombre = p.nombre;
    this.descripcion = p.descripcion ?? "";
  }

  alternar(clave: Permiso, valor: boolean) {
    const s = new Set(this.marcados());
    if (valor) s.add(clave);
    else s.delete(clave);
    this.marcados.set(s);
  }

  guardar(p: Perfil) {
    this.guardando.set(true);
    const patch = this.esAdmin()
      ? { nombre: this.nombre, descripcion: this.descripcion || null }
      : { nombre: this.nombre, descripcion: this.descripcion || null, permisos: [...this.marcados()] };
    this.api.actualizar(p.id, patch).subscribe({
      next: () => {
        this.guardando.set(false);
        this.msg.add({ severity: "success", summary: "Perfil guardado", detail: "Los usuarios ven los cambios en su próxima acción", life: 3000 });
        this.recargar(p.id);
      },
      error: (err) => this.error(err),
    });
  }

  alternarVigente(p: Perfil) {
    this.api.actualizar(p.id, { vigente: !p.vigente }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: p.vigente ? "Perfil desactivado" : "Perfil activado", life: 2500 });
        this.recargar(p.id);
      },
      error: (err) => this.error(err),
    });
  }

  async nuevo(base?: Perfil) {
    const nombre = await this.prompt.open({ header: base ? `Copiar ${base.nombre}` : "Nuevo perfil", label: "Nombre del perfil", required: true });
    if (!nombre) return;
    const codigo = nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    this.api.crear({ codigo, nombre: nombre.trim(), permisos: [], copiarDe: base?.id }).subscribe({
      next: (p) => {
        this.msg.add({ severity: "success", summary: "Perfil creado", life: 2500 });
        this.recargar(p.id);
      },
      error: (err) => this.error(err),
    });
  }

  eliminar(p: Perfil) {
    this.api.eliminar(p.id).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Perfil eliminado", life: 2500 });
        this.seleccionadoId.set(null);
        this.recargar();
      },
      error: (err) => this.error(err),
    });
  }

  private error(err: { error?: { message?: string }; message?: string }) {
    this.guardando.set(false);
    this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 });
  }
}
