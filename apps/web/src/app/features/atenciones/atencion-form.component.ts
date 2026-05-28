import { Component, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import type { Afiliado } from "@legalmene/shared";

@Component({
  selector: "lm-atencion-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card>
      <mat-card-header><mat-card-title>Nueva atención</mat-card-title></mat-card-header>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="submit()" style="display:grid; gap:16px; max-width:680px;">
          <mat-form-field appearance="outline">
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="tipo">
              <mat-option value="Consulta">Consulta</mat-option>
              <mat-option value="Asesoria">Asesoría</mat-option>
              <mat-option value="Juicio">Juicio</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Afiliado</mat-label>
            <mat-select formControlName="afiliadoId">
              <mat-option *ngFor="let a of afiliados()" [value]="a.id">
                {{ a.rut }} — {{ a.apellidoPaterno }}, {{ a.nombres }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Competencia</mat-label>
            <mat-select formControlName="competencia">
              <mat-option *ngFor="let c of competencias" [value]="c">{{ c }}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Materia</mat-label>
            <input matInput formControlName="materia" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Descripción</mat-label>
            <textarea matInput rows="4" formControlName="descripcion"></textarea>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Prioridad</mat-label>
            <mat-select formControlName="prioridad">
              <mat-option value="Baja">Baja</mat-option>
              <mat-option value="Media">Media</mat-option>
              <mat-option value="Alta">Alta</mat-option>
              <mat-option value="Urgente">Urgente</mat-option>
            </mat-select>
          </mat-form-field>

          <div style="display:flex; gap:12px;">
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
              Crear
            </button>
            <button mat-button type="button" (click)="cancelar()">Cancelar</button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
})
export class AtencionFormComponent {
  private fb = inject(FormBuilder);
  private api = inject(AtencionesApiService);
  private afiliadosApi = inject(AfiliadosApiService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  protected afiliados = signal<Afiliado[]>([]);
  protected saving = signal(false);
  protected competencias = [
    "Civil",
    "Penal",
    "Laboral",
    "Familia",
    "Tributario",
    "Comercial",
    "Administrativo",
    "Constitucional",
    "Otro",
  ];

  protected form = this.fb.group({
    tipo: ["Consulta", Validators.required],
    afiliadoId: ["", Validators.required],
    competencia: ["Civil", Validators.required],
    materia: ["", [Validators.required, Validators.maxLength(250)]],
    descripcion: [""],
    prioridad: ["Media"],
  });

  constructor() {
    this.afiliadosApi.buscar({ pageSize: 200 }).subscribe((res) => this.afiliados.set(res.data));
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;
    const payload = {
      afiliadoId: v.afiliadoId!,
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
        this.snack.open(`Creada: ${atencion.correlativo}`, "OK", { duration: 3000 });
        void this.router.navigate(["/atenciones", atencion.id]);
      },
      error: (err) => {
        this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  cancelar() {
    void this.router.navigate(["/atenciones"]);
  }
}
