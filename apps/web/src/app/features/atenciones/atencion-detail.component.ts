import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { environment } from "../../../environments/environment";
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
import { DocumentosApiService, DocumentoMeta } from "../../core/services/documentos.service";
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
          <span style="flex:1"></span>
          <button mat-stroked-button (click)="descargarPdf(a.id)">
            <mat-icon>picture_as_pdf</mat-icon> Descargar PDF
          </button>
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
                  <mat-card-title>Comité del {{ c.fechaConvocatoria | date: 'short' }}</mat-card-title>
                  <mat-card-subtitle>
                    <mat-chip>{{ c.estado }}</mat-chip>
                    <mat-chip [color]="c.decision === 'Aprobado' ? 'primary' : c.decision === 'Rechazado' ? 'warn' : 'accent'" highlighted>{{ c.decision }}</mat-chip>
                  </mat-card-subtitle>
                </mat-card-header>
                <mat-card-content>
                  <p><strong>Motivo:</strong> {{ c.motivo }}</p>
                  <p *ngIf="c.acta"><strong>Acta:</strong> {{ c.acta }}</p>
                </mat-card-content>
                <mat-card-actions *ngIf="c.estado !== 'Cerrado' && c.estado !== 'Cancelado'">
                  <button mat-button color="primary" (click)="votar(c.id, 'AFavor')">Votar a favor</button>
                  <button mat-button color="warn" (click)="votar(c.id, 'EnContra')">Votar en contra</button>
                  <button mat-button (click)="votar(c.id, 'Abstencion')">Abstención</button>
                  <span style="flex:1"></span>
                  <button mat-stroked-button color="primary" (click)="cerrarComite(c.id, 'Aprobado')">Cerrar Aprobado</button>
                  <button mat-stroked-button color="warn" (click)="cerrarComite(c.id, 'Rechazado')">Cerrar Rechazado</button>
                </mat-card-actions>
              </mat-card>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Documentos ({{ documentos().length }})">
          <div style="padding:16px 0;">
            <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px;">
              <input #fileInput type="file" (change)="onFileSelected(a.id, $event)" style="display:none" />
              <button mat-stroked-button (click)="fileInput.click()" [disabled]="uploading()">
                <mat-icon>upload</mat-icon> {{ uploading() ? 'Subiendo…' : 'Subir documento' }}
              </button>
              <small *ngIf="uploadProgress()" style="opacity:0.7;">{{ uploadProgress() }}</small>
            </div>

            <div *ngFor="let d of documentos()" style="display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid #eee;">
              <mat-icon>description</mat-icon>
              <div style="flex:1;">
                <div>{{ d.nombre }}</div>
                <small style="opacity:0.6;">{{ formatBytes(d.tamanoBytes) }} · {{ d.mimeType }} · {{ d.fechaSubida | date: 'short' }}</small>
              </div>
              <button mat-icon-button (click)="descargar(d)" title="Descargar">
                <mat-icon>download</mat-icon>
              </button>
            </div>
            <p *ngIf="!documentos().length" style="opacity:0.5;">Sin documentos.</p>
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
  private documentosApi = inject(DocumentosApiService);
  private snack = inject(MatSnackBar);

  protected atencion = signal<Atencion | null>(null);
  protected gestiones = signal<Gestion[]>([]);
  protected comites = signal<Comite[]>([]);
  protected documentos = signal<DocumentoMeta[]>([]);
  protected uploading = signal(false);
  protected uploadProgress = signal<string>("");
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
    this.documentosApi.listar(id).subscribe((d) => this.documentos.set(d));
  }

  onFileSelected(atencionId: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.uploadProgress.set(`Subiendo ${file.name}…`);
    this.documentosApi.upload(atencionId, file).subscribe({
      next: () => {
        this.uploading.set(false);
        this.uploadProgress.set("");
        input.value = "";
        this.snack.open(`${file.name} subido`, "OK", { duration: 2000 });
        this.cargar(atencionId);
      },
      error: (err) => {
        this.uploading.set(false);
        this.uploadProgress.set("");
        this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 5000 });
      },
    });
  }

  descargar(doc: DocumentoMeta) {
    this.documentosApi.getDownloadUrl(doc.id).subscribe(({ url }) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.nombre;
      a.click();
    });
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  descargarPdf(atencionId: string) {
    const codPlan = localStorage.getItem("cod_plan") ?? "DEMO";
    fetch(`${environment.apiBaseUrl}/exports/atenciones/${atencionId}.pdf`, {
      headers: { "X-Cod-Plan": codPlan },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `atencion-${atencionId}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
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

  votar(comiteId: string, voto: "AFavor" | "EnContra" | "Abstencion") {
    const comentario = window.prompt(`Comentario (${voto}):`) ?? undefined;
    this.comitesApi.votar(comiteId, { voto, comentario }).subscribe({
      next: () => {
        this.snack.open(`Voto ${voto} registrado`, "OK", { duration: 2000 });
        if (this.atencion()) this.cargar(this.atencion()!.id);
      },
      error: (err) =>
        this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 4000 }),
    });
  }

  cerrarComite(comiteId: string, decision: "Aprobado" | "Rechazado" | "Diferido") {
    const acta = window.prompt(`Acta de cierre (${decision}):`);
    if (!acta) return;
    this.comitesApi.cerrar(comiteId, { decision, acta }).subscribe({
      next: () => {
        this.snack.open(`Comité cerrado: ${decision}`, "OK", { duration: 2500 });
        if (this.atencion()) this.cargar(this.atencion()!.id);
      },
      error: (err) =>
        this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 4000 }),
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
