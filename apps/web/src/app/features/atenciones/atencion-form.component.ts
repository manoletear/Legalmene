import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { PLANES_SIN_COBERTURA } from "@legalmene/shared";
import type { AfiliadoConPlanes } from "@legalmene/shared";

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
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
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
          ></p-select>
          <small *ngIf="sinPlanVigente()" class="lm-muted">
            El RUT no tiene planes vigentes: la atención se registra como Rezagado o MetLife.
          </small>
        </div>

        <div class="lm-col" style="gap:4px;">
          <label>Competencia</label>
          <p-select
            formControlName="competencia"
            [options]="competenciaOpts"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
          ></p-select>
        </div>

        <div class="lm-col" style="gap:4px;">
          <label>Materia</label>
          <input pInputText type="text" formControlName="materia" />
        </div>

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
  private router = inject(Router);
  private msg = inject(MessageService);

  protected afiliados = signal<AfiliadoConPlanes[]>([]);
  protected planOpts = signal<{ label: string; value: string; disabled: boolean }[]>([]);
  protected sinPlanVigente = signal(false);
  protected saving = signal(false);

  protected tipoOpts = [
    { label: "Consulta", value: "Consulta" },
    { label: "Asesoría", value: "Asesoria" },
    { label: "Juicio", value: "Juicio" },
  ];
  protected competenciaOpts = [
    "Civil", "Penal", "Laboral", "Familia", "Tributario",
    "Comercial", "Administrativo", "Constitucional", "Otro",
  ].map((c) => ({ label: c, value: c }));
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
    competencia: ["Civil", Validators.required],
    materia: ["", [Validators.required, Validators.maxLength(250)]],
    descripcion: [""],
    prioridad: ["Media"],
  });

  constructor() {
    this.afiliadosApi.buscar({ pageSize: 200 }).subscribe((res) => this.afiliados.set(res.data));
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
    });
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;
    const payload = {
      afiliadoId: v.afiliadoId!,
      codPlan: v.codPlan!,
      competencia: v.competencia as "Civil",
      materia: v.materia!,
      descripcion: v.descripcion || undefined,
      prioridad: v.prioridad as "Media",
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
