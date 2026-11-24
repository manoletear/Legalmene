import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { MessageService } from "primeng/api";
import { CreateAfiliadoSchema, type Afiliado, type Region } from "@legalmene/shared";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { MaestrosApiService } from "../../core/services/maestros.service";

type Campos = {
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  email: string;
  telefono: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  region: string;
  fechaNacimiento: string;
  vigencia: "Activo" | "Inactivo";
};

const VACIO: Campos = {
  rut: "",
  nombres: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  email: "",
  telefono: "",
  direccion: "",
  comuna: "",
  ciudad: "",
  region: "",
  fechaNacimiento: "",
  vigencia: "Activo",
};

// Alta y edición de un afiliado (Anexo §II). Sin `afiliado` crea; con él edita.
// La validación es la del esquema compartido; la API vuelve a validar y responde 409 si el RUT ya existe.
@Component({
  selector: "lm-afiliado-form",
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, InputTextModule, ButtonModule, SelectModule],
  template: `
    <p-dialog
      [header]="afiliado ? 'Editar afiliado' : 'Nuevo afiliado'"
      [visible]="visible"
      (visibleChange)="!$event && cerrar.emit()"
      [modal]="true"
      [style]="{ width: '640px', maxWidth: '95vw' }"
    >
      <form class="lm-form-grid" (ngSubmit)="guardar()" #f="ngForm">
        <label>RUT *<input pInputText name="rut" [(ngModel)]="c.rut" placeholder="12345678-9" [disabled]="!!afiliado" /></label>
        <label>Nombres *<input pInputText name="nombres" [(ngModel)]="c.nombres" /></label>
        <label>Apellido paterno *<input pInputText name="apellidoPaterno" [(ngModel)]="c.apellidoPaterno" /></label>
        <label>Apellido materno<input pInputText name="apellidoMaterno" [(ngModel)]="c.apellidoMaterno" /></label>
        <label>Correo<input pInputText type="email" name="email" [(ngModel)]="c.email" /></label>
        <label>Teléfono<input pInputText name="telefono" [(ngModel)]="c.telefono" /></label>
        <label class="lm-span-2">Dirección<input pInputText name="direccion" [(ngModel)]="c.direccion" /></label>
        <label
          >Región
          <p-select name="region" [(ngModel)]="c.region" [options]="regionNombres()" [editable]="true" [filter]="false"
            appendTo="body" placeholder="Región" (onChange)="cargarLugares()"></p-select>
        </label>
        <label
          >Ciudad
          <p-select name="ciudad" [(ngModel)]="c.ciudad" [options]="ciudades()" [editable]="true" appendTo="body" placeholder="Ciudad"></p-select>
        </label>
        <label
          >Comuna
          <p-select name="comuna" [(ngModel)]="c.comuna" [options]="comunas()" [editable]="true" appendTo="body" placeholder="Comuna"></p-select>
        </label>
        <label>Fecha de nacimiento<input pInputText type="date" name="fechaNacimiento" [(ngModel)]="c.fechaNacimiento" /></label>
        <label *ngIf="afiliado"
          >Vigencia
          <p-select name="vigencia" [(ngModel)]="c.vigencia" [options]="vigencias" appendTo="body"></p-select>
        </label>
        <p *ngIf="error()" class="lm-span-2 lm-error" role="alert">{{ error() }}</p>
        <div class="lm-span-2" style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton type="button" label="Cancelar" [text]="true" (click)="cerrar.emit()"></button>
          <button pButton type="submit" [label]="afiliado ? 'Guardar cambios' : 'Crear afiliado'" icon="pi pi-check" [loading]="guardando()"></button>
        </div>
      </form>
    </p-dialog>
  `,
  styles: [
    `
      .lm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .lm-form-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 0.875rem; }
      .lm-span-2 { grid-column: span 2; }
      .lm-error { color: var(--p-red-600, #c62828); margin: 0; }
      @media (max-width: 560px) { .lm-form-grid { grid-template-columns: 1fr; } .lm-span-2 { grid-column: span 1; } }
    `,
  ],
})
export class AfiliadoFormComponent implements OnChanges {
  private api = inject(AfiliadosApiService);
  private msg = inject(MessageService);
  private maestros = inject(MaestrosApiService);
  private regiones: Region[] = [];
  protected regionNombres = signal<string[]>([]);
  protected ciudades = signal<string[]>([]);
  protected comunas = signal<string[]>([]);

  @Input() visible = false;
  @Input() afiliado: Afiliado | null = null;
  // RUT con el que se abre el alta (p. ej. el buscado y no encontrado).
  @Input() rutInicial = "";
  @Output() guardado = new EventEmitter<Afiliado>();
  @Output() cerrar = new EventEmitter<void>();

  protected c: Campos = { ...VACIO };
  protected error = signal<string | null>(null);
  protected guardando = signal(false);
  protected vigencias = [
    { label: "Activo", value: "Activo" },
    { label: "Inactivo", value: "Inactivo" },
  ];

  ngOnChanges() {
    if (!this.visible) return;
    if (!this.regiones.length) {
      this.maestros.listar("regiones", { vigente: true }).subscribe((r) => {
        this.regiones = r;
        this.regionNombres.set(r.map((x) => x.nombre));
        this.cargarLugares();
      });
    }
    this.error.set(null);
    const a = this.afiliado;
    this.c = a
      ? {
          rut: a.rut,
          nombres: a.nombres,
          apellidoPaterno: a.apellidoPaterno,
          apellidoMaterno: a.apellidoMaterno ?? "",
          email: a.email ?? "",
          telefono: a.telefono ?? "",
          direccion: a.direccion ?? "",
          comuna: a.comuna ?? "",
          ciudad: a.ciudad ?? "",
          region: a.region ?? "",
          fechaNacimiento: a.fechaNacimiento ?? "",
          vigencia: a.vigencia === "Inactivo" ? "Inactivo" : "Activo",
        }
      : { ...VACIO, rut: this.rutInicial };
    this.cargarLugares();
  }

  // Ciudades y comunas de la región elegida (si la región está en el maestro).
  cargarLugares() {
    const region = this.regiones.find((r) => r.nombre === this.c.region?.trim());
    if (!region) {
      this.ciudades.set([]);
      this.comunas.set([]);
      return;
    }
    this.maestros.listar("ciudades", { vigente: true, regionId: region.id }).subscribe((r) => this.ciudades.set(r.map((x) => x.nombre)));
    this.maestros.listar("comunas", { vigente: true, regionId: region.id }).subscribe((r) => this.comunas.set(r.map((x) => x.nombre)));
  }

  // Campos vacíos viajan como null (o se omiten) para no chocar con las validaciones de formato.
  private payload() {
    const t = (v: string) => v.trim() || null;
    return {
      rut: this.c.rut.replace(/[.\s]/g, "").toUpperCase(),
      nombres: this.c.nombres.trim(),
      apellidoPaterno: this.c.apellidoPaterno.trim(),
      apellidoMaterno: t(this.c.apellidoMaterno),
      email: t(this.c.email),
      telefono: t(this.c.telefono),
      direccion: t(this.c.direccion),
      comuna: t(this.c.comuna ?? ""),
      ciudad: t(this.c.ciudad ?? ""),
      region: t(this.c.region ?? ""),
      fechaNacimiento: t(this.c.fechaNacimiento),
      ...(this.afiliado ? { vigencia: this.c.vigencia } : {}),
    };
  }

  guardar() {
    const datos = this.payload();
    const v = CreateAfiliadoSchema.safeParse(datos);
    if (!v.success) {
      const i = v.error.issues[0];
      this.error.set(`${ETIQUETA[String(i.path[0])] ?? i.path.join(".")}: ${i.message}`);
      return;
    }
    this.error.set(null);
    this.guardando.set(true);
    const a = this.afiliado;
    const op = a ? this.api.actualizar(a.id, (({ rut: _rut, ...resto }) => resto)(datos)) : this.api.crear(datos);
    op.subscribe({
      next: (res) => {
        this.guardando.set(false);
        this.msg.add({ severity: "success", summary: a ? "Afiliado actualizado" : "Afiliado creado", detail: res.rut, life: 3000 });
        this.guardado.emit(res);
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err.error?.message ?? err.message);
      },
    });
  }
}

const ETIQUETA: Record<string, string> = {
  rut: "RUT",
  nombres: "Nombres",
  apellidoPaterno: "Apellido paterno",
  apellidoMaterno: "Apellido materno",
  email: "Correo",
  telefono: "Teléfono",
  direccion: "Dirección",
  comuna: "Comuna",
  ciudad: "Ciudad",
  region: "Región",
  fechaNacimiento: "Fecha de nacimiento",
};
