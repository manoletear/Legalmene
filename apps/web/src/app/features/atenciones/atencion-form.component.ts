import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { MessageService } from "primeng/api";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { MaestrosApiService } from "../../core/services/maestros.service";
import { CoberturasApiService } from "../../core/services/coberturas.service";
import { PLANES_SIN_COBERTURA } from "@legalmene/shared";
import type { AfiliadoConPlanes, CanalContacto, Competencia, CopagoResultado, MaestroSimple, Materia, TipoAtencion } from "@legalmene/shared";

@Component({
  selector: "lm-atencion-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ButtonModule,
  ],
  template: `
    <p-card header="Nueva atención">
      <form [formGroup]="form" (ngSubmit)="submit()" class="lm-col" style="gap:16px; max-width:680px;">
        <div class="lm-col" style="gap:4px;">
          <label>Tipo</label>
          <p-select
            formControlName="tipo"
            [options]="tipoOpts"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
            (onChange)="cargarMaterias()"
          ></p-select>
        </div>

        <div class="lm-col" style="gap:4px;">
          <label>Afiliado</label>
          <p-select
            formControlName="afiliadoId"
            [options]="afiliadoOpts()"
            optionLabel="label"
            optionValue="value"
            [filter]="true"
            filterBy="label"
            appendTo="body"
            placeholder="Selecciona afiliado"
            (onChange)="cargarPlanes($event.value)"
          ></p-select>
        </div>

        <div class="lm-col" style="gap:4px;" *ngIf="form.value.afiliadoId">
          <label>Plan</label>
          <p-select
            formControlName="codPlan"
            [options]="planOpts()"
            optionLabel="label"
            optionValue="value"
            optionDisabled="disabled"
            appendTo="body"
            placeholder="Selecciona plan"
            (onChange)="previsualizarCopago()"
          ></p-select>
          <small *ngIf="sinPlanVigente()" class="lm-muted">
            El RUT no tiene planes vigentes: la atención se registra como Rezagado o MetLife.
          </small>
        </div>

        <div class="lm-col" style="gap:4px;">
          <label>Competencia</label>
          <p-select
            formControlName="competenciaId"
            [options]="competencias()"
            optionLabel="nombre"
            optionValue="id"
            [filter]="true"
            filterBy="nombre"
            appendTo="body"
            placeholder="Selecciona competencia"
            (onChange)="cargarMaterias()"
          ></p-select>
        </div>

        <div class="lm-col" style="gap:4px;">
          <label>Materia</label>
          <p-select
            formControlName="materiaId"
            [options]="materias()"
            optionLabel="nombre"
            optionValue="id"
            [filter]="true"
            filterBy="nombre"
            appendTo="body"
            [placeholder]="form.value.competenciaId ? 'Selecciona materia' : 'Primero elige la competencia'"
            emptyMessage="La competencia no tiene materias para este tipo de atención"
            (onChange)="previsualizarCopago()"
          ></p-select>
          <small *ngIf="copago() as c" class="lm-muted">
            <ng-container *ngIf="c.copagoUfCentesimas !== null; else sinArancel">
              Copago del afiliado: {{ c.copagoUfCentesimas / 100 | number: '1.0-2' }} UF
              <ng-container *ngIf="c.copagoClp !== null">($ {{ c.copagoClp | number }})</ng-container>
            </ng-container>
            <ng-template #sinArancel>Sin arancel definido para esta materia.</ng-template>
          </small>
        </div>

        <div class="lm-col" style="gap:4px;">
          <label>Asunto</label>
          <input pInputText type="text" formControlName="asunto" placeholder="Resumen del caso (ej. Despido de Juan Pérez)" />
        </div>

        <ng-container *ngIf="form.value.tipo === 'Consulta'">
          <div class="lm-row" style="gap:12px; flex-wrap:wrap;">
            <div class="lm-col" style="gap:4px; flex:1; min-width:200px;">
              <label>Canal</label>
              <p-select formControlName="canalContacto" [options]="canalOpts" optionLabel="label" optionValue="value" appendTo="body" placeholder="Canal de contacto"></p-select>
            </div>
            <div class="lm-col" style="gap:4px; flex:1; min-width:200px;">
              <label>Tipo de consulta</label>
              <p-select formControlName="tipoConsultaId" [options]="tiposConsulta()" optionLabel="nombre" optionValue="id" appendTo="body" placeholder="Tipo" [showClear]="true"></p-select>
            </div>
          </div>
          <div class="lm-col" style="gap:4px;">
            <label>Código de grabación</label>
            <input pInputText type="text" formControlName="codigoGrabacion" placeholder="Opcional (llamadas grabadas)" />
          </div>
        </ng-container>

        <div class="lm-col" style="gap:4px;">
          <label>Descripción</label>
          <textarea pTextarea rows="4" formControlName="descripcion"></textarea>
        </div>

        <div class="lm-col" style="gap:4px;">
          <label>Prioridad</label>
          <p-select
            formControlName="prioridad"
            [options]="prioridadOpts"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
          ></p-select>
        </div>

        <div class="lm-row" style="gap:12px;">
          <button pButton type="submit" label="Crear" [disabled]="form.invalid || saving()"></button>
          <button pButton type="button" label="Cancelar" [text]="true" severity="secondary" (click)="cancelar()"></button>
        </div>
      </form>
    </p-card>
  `,
})
export class AtencionFormComponent {
  private fb = inject(FormBuilder);
  private api = inject(AtencionesApiService);
  private afiliadosApi = inject(AfiliadosApiService);
  private maestrosApi = inject(MaestrosApiService);
  private coberturasApi = inject(CoberturasApiService);
  private router = inject(Router);
  private msg = inject(MessageService);

  protected competencias = signal<Competencia[]>([]);
  protected materias = signal<Materia[]>([]);
  protected copago = signal<CopagoResultado | null>(null);
  protected tiposConsulta = signal<MaestroSimple[]>([]);
  protected canalOpts: { label: string; value: CanalContacto }[] = [
    { label: "Telefónico", value: "Telefonico" },
    { label: "Presencial", value: "Presencial" },
    { label: "Correo electrónico", value: "Email" },
    { label: "Chat", value: "Chat" },
    { label: "Videoconferencia", value: "Videoconferencia" },
  ];

  protected afiliados = signal<AfiliadoConPlanes[]>([]);
  protected planOpts = signal<{ label: string; value: string; disabled: boolean }[]>([]);
  protected sinPlanVigente = signal(false);
  protected saving = signal(false);

  protected tipoOpts = [
    { label: "Consulta", value: "Consulta" },
    { label: "Asesoría", value: "Asesoria" },
    { label: "Juicio", value: "Juicio" },
  ];
  protected prioridadOpts = [
    { label: "Baja", value: "Baja" },
    { label: "Media", value: "Media" },
    { label: "Alta", value: "Alta" },
    { label: "Urgente", value: "Urgente" },
  ];

  protected afiliadoOpts = () =>
    this.afiliados().map((a) => ({
      label: `${a.rut} — ${a.apellidoPaterno}, ${a.nombres}`,
      value: a.id,
    }));

  protected form = this.fb.group({
    tipo: ["Consulta", Validators.required],
    afiliadoId: ["", Validators.required],
    codPlan: ["", Validators.required],
    competenciaId: ["", Validators.required],
    materiaId: ["", Validators.required],
    asunto: ["", [Validators.required, Validators.maxLength(250)]],
    descripcion: [""],
    prioridad: ["Media"],
    canalContacto: ["Telefonico"],
    tipoConsultaId: [null as string | null],
    codigoGrabacion: [""],
  });

  constructor() {
    this.afiliadosApi.buscar({ pageSize: 200 }).subscribe((res) => this.afiliados.set(res.data));
    this.maestrosApi.listar("competencias", { vigente: true }).subscribe((c) => this.competencias.set(c));
    this.maestrosApi.listar("tipos-consulta", { vigente: true }).subscribe((t) => this.tiposConsulta.set(t));
  }

  // Materias vigentes de la competencia que aplican al tipo de atención elegido.
  cargarMaterias() {
    const { competenciaId, tipo, materiaId } = this.form.value;
    if (!competenciaId) {
      this.materias.set([]);
      this.form.patchValue({ materiaId: "" });
      return;
    }
    this.maestrosApi
      .listar("materias", { competenciaId, vigente: true, aplicaA: tipo as TipoAtencion })
      .subscribe((m) => {
        this.materias.set(m);
        if (!m.some((x) => x.id === materiaId)) this.form.patchValue({ materiaId: "" });
        this.previsualizarCopago();
      });
  }

  previsualizarCopago() {
    const { codPlan, materiaId, tipo } = this.form.value;
    if (!codPlan || !materiaId || !tipo) {
      this.copago.set(null);
      return;
    }
    this.coberturasApi.copago(codPlan, materiaId, tipo as TipoAtencion).subscribe({
      next: (c) => this.copago.set(c),
      error: () => this.copago.set(null),
    });
  }

  // Solo los planes vigentes del RUT son seleccionables; sin ninguno, Rezagado/MetLife.
  cargarPlanes(afiliadoId: string | null) {
    this.form.patchValue({ codPlan: "" });
    this.planOpts.set([]);
    if (!afiliadoId) return;
    this.afiliadosApi.obtener(afiliadoId).subscribe((afi) => {
      const vigentes = afi.planes.filter((p) => p.vigente);
      const opciones = afi.planes.map((p) => ({
        label: `${p.codPlan} — ${p.nombrePlan}${p.vigente ? "" : " (no vigente)"}`,
        value: p.codPlan,
        disabled: !p.vigente,
      }));
      if (vigentes.length === 0) {
        opciones.unshift(
          ...PLANES_SIN_COBERTURA.map((c) => ({ label: c === "REZAGADO" ? "Rezagado" : "MetLife", value: c, disabled: false })),
        );
      }
      this.sinPlanVigente.set(vigentes.length === 0);
      this.planOpts.set(opciones);
      this.form.patchValue({ codPlan: vigentes[0]?.codPlan ?? "REZAGADO" });
      this.previsualizarCopago();
    });
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;
    const payload = {
      afiliadoId: v.afiliadoId!,
      codPlan: v.codPlan!,
      competenciaId: v.competenciaId!,
      materiaId: v.materiaId!,
      asunto: v.asunto!,
      descripcion: v.descripcion || undefined,
      prioridad: v.prioridad as "Media",
      ...(v.tipo === "Consulta"
        ? {
            canalContacto: (v.canalContacto as CanalContacto) || undefined,
            tipoConsultaId: v.tipoConsultaId || undefined,
            codigoGrabacion: v.codigoGrabacion || undefined,
          }
        : {}),
    };
    const obs =
      v.tipo === "Consulta"
        ? this.api.crearConsulta(payload)
        : v.tipo === "Asesoria"
          ? this.api.crearAsesoria(payload)
          : this.api.crearJuicio(payload);
    obs.subscribe({
      next: (atencion) => {
        this.msg.add({ severity: "success", summary: "Creada", detail: atencion.correlativo, life: 3000 });
        void this.router.navigate(["/atenciones", atencion.id]);
      },
      error: (err) => {
        this.msg.add({
          severity: "error",
          summary: "Error",
          detail: err.error?.message ?? err.message,
          life: 5000,
        });
        this.saving.set(false);
      },
    });
  }

  cancelar() {
    void this.router.navigate(["/atenciones"]);
  }
}
