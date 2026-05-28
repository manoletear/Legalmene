import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatDividerModule } from "@angular/material/divider";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatTabsModule } from "@angular/material/tabs";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { GestionesApiService } from "../../core/services/gestiones.service";
import { ComitesApiService } from "../../core/services/comites.service";
import type { Atencion, Comite, Gestion } from "@legalmene/shared";

@Component({
  selector: "lm-atencion-detail",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDividerModule,
    MatExpansionModule,
    MatTabsModule,
    MatSnackBarModule,
  ],
  template: `
    <ng-container *ngIf="atencion() as a">
      <mat-card>
        <mat-card-header>
          <mat-card-title>{{ a.correlativo }} — {{ a.materia }}</mat-card-title>
          <mat-card-subtitle>
            <mat-chip color="primary" highlighted>{{ a.tipo }}</mat-chip>
            <mat-chip [color]="estadoColor(a.estado)" highlighted>{{ a.estado }}</mat-chip>
            <span style="margin-left:8px">{{ a.competencia }} · {{ a.prioridad }}</span>
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <p *ngIf="a.descripcion">{{ a.descripcion }}</p>
          <p style="opacity:0.6"><small>Abierta {{ a.fechaApertura | date: 'medium' }}</small></p>
        </mat-card-content>
        <mat-card-actions>
          <button mat-stroked-button *ngIf="a.tipo === 'Consulta'" (click)="derivar('Asesoria')">Derivar a Asesoría</button>
          <button mat-stroked-button *ngIf="a.tipo !== 'Juicio'" (click)="derivar('Juicio')">Derivar a Juicio</button>
        </mat-card-actions>
      </mat-card>

      <mat-tab-group style="margin-top:16px">
        <mat-tab label="Gestiones ({{ gestiones().length }})">
          <div style="padding:16px 0;">
            <h3>Nueva gestión</h3>
            <form [formGroup]="formGestion" (ngSubmit)="crearGestion(a.id)" style="display:grid; gap:12px; max-width:680px;">
              <mat-form-field appearance="outline">
                <mat-label>Tipo</mat-label>
                <mat-select formControlName="tipo">
                  <mat-option *ngFor="let t of tiposGestion" [value]="t">{{ t }}</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Título</mat-label>
                <input matInput formControlName="titulo" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Detalle</mat-label>
                <textarea matInput rows="3" formControlName="detalle"></textarea>
              </mat-form-field>
              <button mat-flat-button color="primary" type="submit" [disabled]="formGestion.invalid">Crear gestión</button>
            </form>

            <mat-divider style="margin:24px 0;"></mat-divider>

            <h3>Timeline</h3>
            <div *ngFor="let g of gestiones()" style="margin-bottom:12px;">
              <mat-expansion-panel>
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-chip [color]="g.estado === 'Completada' ? 'primary' : 'accent'" highlighted style="margin-right:8px">{{ g.estado }}</mat-chip>
                    {{ g.titulo }}
                  </mat-panel-title>
                  <mat-panel-description>{{ g.tipo }} · {{ g.createdAt | date: 'short' }}</mat-panel-description>
                </mat-expansion-panel-header>
                <p *ngIf="g.detalle">{{ g.detalle }}</p>
                <p *ngIf="g.resultado"><strong>Resultado:</strong> {{ g.resultado }}</p>
                <button *ngIf="g.estado === 'Pendiente'" mat-button (click)="completar(g.id)">Marcar completada</button>
              </mat-expansion-panel>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Comités ({{ comites().length }})">
          <div style="padding:16px 0;">
            <button mat-stroked-button (click)="convocarComite(a.id)">Convocar comité</button>
            <div *ngFor="let c of comites()" style="margin-top:16px;">
              <mat-card>
                <mat-card-header>
                  <mat-card-title>
                    Comité del {{ c.fechaConvocatoria | date: 'short' }}
                  </mat-card-title>
                  <mat-card-subtitle>
                    <mat-chip>{{ c.estado }}</mat-chip>
                    <mat-chip [color]="c.decision === 'Aprobado' ? 'primary' : 'warn'" highlighted>{{ c.decision }}</mat-chip>
                  </mat-card-subtitle>
                </mat-card-header>
                <mat-card-content>
                  <p><strong>Motivo:</strong> {{ c.motivo }}</p>
                  <p *ngIf="c.acta"><strong>Acta:</strong> {{ c.acta }}</p>
                </mat-card-content>
              </mat-card>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </ng-container>
  `,
})
export class AtencionDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private api = inject(AtencionesApiService);
  private gestionesApi = inject(GestionesApiService);
  private comitesApi = inject(ComitesApiService);
  private snack = inject(MatSnackBar);

  protected atencion = signal<Atencion | null>(null);
  protected gestiones = signal<Gestion[]>([]);
  protected comites = signal<Comite[]>([]);
  protected tiposGestion = [
    "LlamadaTelefonica",
    "Email",
    "Reunion",
    "EscritoJudicial",
    "Audiencia",
    "Notificacion",
    "AnalisisDocumental",
    "Resolucion",
    "Otra",
  ];

  // ResponsableId hardcoded al dev-admin UUID; en prod viene del JWT.
  private static readonly DEV_ADMIN_ID = "5dea0886-7856-452c-85af-eb2f2e65e726";

  protected formGestion = this.fb.group({
    tipo: ["LlamadaTelefonica", Validators.required],
    titulo: ["", [Validators.required, Validators.maxLength(200)]],
    detalle: [""],
    responsableId: [AtencionDetailComponent.DEV_ADMIN_ID, Validators.required],
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get("id");
    if (id) this.cargar(id);
  }

  cargar(id: string) {
    this.api.obtener(id).subscribe((a) => this.atencion.set(a));
    this.gestionesApi.listar(id).subscribe((g) => this.gestiones.set(g));
    this.comitesApi.listar(id).subscribe((c) => this.comites.set(c));
  }

  crearGestion(atencionId: string) {
    const v = this.formGestion.value;
    this.gestionesApi
      .crear(atencionId, {
        tipo: v.tipo as "LlamadaTelefonica",
        titulo: v.titulo!,
        detalle: v.detalle || undefined,
        responsableId: v.responsableId!,
        documentosIds: [],
      })
      .subscribe(() => {
        this.snack.open("Gestión creada", "OK", { duration: 2000 });
        this.formGestion.reset({
          tipo: "LlamadaTelefonica",
          responsableId: AtencionDetailComponent.DEV_ADMIN_ID,
        });
        this.cargar(atencionId);
      });
  }

  completar(gestionId: string) {
    const resultado = window.prompt("Resultado de la gestión:");
    if (!resultado) return;
    this.gestionesApi
      .completar(gestionId, { resultado })
      .subscribe(() => this.atencion() && this.cargar(this.atencion()!.id));
  }

  convocarComite(atencionId: string) {
    const motivo = window.prompt("Motivo del comité:");
    if (!motivo) return;
    this.comitesApi
      .convocar(atencionId, {
        motivo,
        participantesIds: [AtencionDetailComponent.DEV_ADMIN_ID],
      })
      .subscribe(() => {
        this.snack.open("Comité convocado", "OK", { duration: 2000 });
        this.cargar(atencionId);
      });
  }

  derivar(nuevoTipo: "Asesoria" | "Juicio") {
    const motivo = window.prompt(`Motivo para derivar a ${nuevoTipo}:`);
    if (!motivo) return;
    const a = this.atencion();
    if (!a) return;
    this.api.derivar(a.id, { nuevoTipo, motivo }).subscribe((nueva) => {
      this.snack.open(`Derivada: ${nueva.correlativo}`, "OK", { duration: 3000 });
      void inject;
      window.location.assign(`/atenciones/${nueva.id}`);
    });
  }

  estadoColor(e: string) {
    if (e === "Cerrada" || e === "Archivada") return undefined;
    if (e === "EnComite" || e === "Suspendida") return "warn";
    return "primary";
  }
}
