import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { environment } from "../../../environments/environment";
import { CardModule } from "primeng/card";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { DividerModule } from "primeng/divider";
import { AccordionModule } from "primeng/accordion";
import { TabsModule } from "primeng/tabs";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import { PromptService } from "../../shared/prompt.service";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { GestionesApiService } from "../../core/services/gestiones.service";
import { ComitesApiService } from "../../core/services/comites.service";
import { DocumentosApiService, DocumentoMeta } from "../../core/services/documentos.service";
import type { Atencion, Comite, Gestion } from "@legalmene/shared";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

@Component({
  selector: "lm-atencion-detail",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DividerModule,
    AccordionModule,
    TabsModule,
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
    <ng-container *ngIf="atencion() as a">
      <p-card>
        <ng-template pTemplate="header">
          <div style="padding:16px 16px 0;">
            <h2 style="margin:0 0 8px 0;">{{ a.correlativo }} — {{ a.materia }}</h2>
            <div class="lm-row">
              <p-tag [value]="a.tipo" severity="info"></p-tag>
              <p-tag [value]="a.estado" [severity]="estadoSeverity(a.estado)"></p-tag>
              <span class="lm-muted" style="margin-left:8px">{{ a.competencia }} · {{ a.prioridad }}</span>
            </div>
          </div>
        </ng-template>
        <p *ngIf="a.descripcion">{{ a.descripcion }}</p>
        <p class="lm-muted lm-small">Abierta {{ a.fechaApertura | date: 'medium' }}</p>
        <ng-template pTemplate="footer">
          <div class="lm-row">
            <button pButton *ngIf="a.tipo === 'Consulta'" [outlined]="true" label="Derivar a Asesoría" (click)="derivar('Asesoria')"></button>
            <button pButton *ngIf="a.tipo !== 'Juicio'" [outlined]="true" label="Derivar a Juicio" (click)="derivar('Juicio')"></button>
            <span class="lm-grow"></span>
            <button pButton [outlined]="true" icon="pi pi-file-pdf" label="Descargar PDF" (click)="descargarPdf(a.id)"></button>
          </div>
        </ng-template>
      </p-card>

      <p-tabs value="0" styleClass="lm-mt-16" [style]="{ 'margin-top': '16px' }">
        <p-tablist>
          <p-tab value="0">Gestiones ({{ gestiones().length }})</p-tab>
          <p-tab value="1">Comités ({{ comites().length }})</p-tab>
          <p-tab value="2">Documentos ({{ documentos().length }})</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="0">
            <h3>Nueva gestión</h3>
            <form [formGroup]="formGestion" (ngSubmit)="crearGestion(a.id)" class="lm-col" style="gap:12px; max-width:680px;">
              <div class="lm-col" style="gap:4px;">
                <label>Tipo</label>
                <p-select
                  formControlName="tipo"
                  [options]="tiposGestionOpts"
                  optionLabel="label"
                  optionValue="value"
                  appendTo="body"
                ></p-select>
              </div>
              <div class="lm-col" style="gap:4px;">
                <label>Título</label>
                <input pInputText type="text" formControlName="titulo" />
              </div>
              <div class="lm-col" style="gap:4px;">
                <label>Detalle</label>
                <textarea pTextarea rows="3" formControlName="detalle"></textarea>
              </div>
              <button pButton type="submit" label="Crear gestión" [disabled]="formGestion.invalid"></button>
            </form>

            <p-divider></p-divider>

            <h3>Timeline</h3>
            <p-accordion>
              <p-accordion-panel *ngFor="let g of gestiones(); let i = index" [value]="i">
                <p-accordion-header>
                  <div class="lm-row" style="flex:1;">
                    <p-tag [value]="g.estado" [severity]="g.estado === 'Completada' ? 'success' : 'warn'"></p-tag>
                    <span>{{ g.titulo }}</span>
                    <span class="lm-grow"></span>
                    <small class="lm-muted">{{ g.tipo }} · {{ g.createdAt | date: 'short' }}</small>
                  </div>
                </p-accordion-header>
                <p-accordion-content>
                  <p *ngIf="g.detalle">{{ g.detalle }}</p>
                  <p *ngIf="g.resultado"><strong>Resultado:</strong> {{ g.resultado }}</p>
                  <button pButton *ngIf="g.estado === 'Pendiente'" [text]="true" label="Marcar completada" (click)="completar(g.id)"></button>
                </p-accordion-content>
              </p-accordion-panel>
            </p-accordion>
          </p-tabpanel>

          <p-tabpanel value="1">
            <button pButton [outlined]="true" label="Convocar comité" (click)="convocarComite(a.id)"></button>
            <div *ngFor="let c of comites()" style="margin-top:16px;">
              <p-card>
                <ng-template pTemplate="header">
                  <div style="padding:16px 16px 0;">
                    <h3 style="margin:0;">Comité del {{ c.fechaConvocatoria | date: 'short' }}</h3>
                    <div class="lm-row" style="margin-top:8px;">
                      <p-tag [value]="c.estado"></p-tag>
                      <p-tag [value]="c.decision" [severity]="decisionSeverity(c.decision)"></p-tag>
                    </div>
                  </div>
                </ng-template>
                <p><strong>Motivo:</strong> {{ c.motivo }}</p>
                <p *ngIf="c.acta"><strong>Acta:</strong> {{ c.acta }}</p>
                <ng-template pTemplate="footer" *ngIf="c.estado !== 'Cerrado' && c.estado !== 'Cancelado'">
                  <div class="lm-row">
                    <button pButton [text]="true" severity="info" label="Votar a favor" (click)="votar(c.id, 'AFavor')"></button>
                    <button pButton [text]="true" severity="danger" label="Votar en contra" (click)="votar(c.id, 'EnContra')"></button>
                    <button pButton [text]="true" severity="secondary" label="Abstención" (click)="votar(c.id, 'Abstencion')"></button>
                    <span class="lm-grow"></span>
                    <button pButton [outlined]="true" label="Cerrar Aprobado" (click)="cerrarComite(c.id, 'Aprobado')"></button>
                    <button pButton [outlined]="true" severity="danger" label="Cerrar Rechazado" (click)="cerrarComite(c.id, 'Rechazado')"></button>
                  </div>
                </ng-template>
              </p-card>
            </div>
          </p-tabpanel>

          <p-tabpanel value="2">
            <div class="lm-row" style="margin-bottom:16px;">
              <input #fileInput type="file" (change)="onFileSelected(a.id, $event)" style="display:none" />
              <button pButton [outlined]="true" icon="pi pi-upload" [label]="uploading() ? 'Subiendo…' : 'Subir documento'" (click)="fileInput.click()" [disabled]="uploading()"></button>
              <small *ngIf="uploadProgress()" class="lm-muted">{{ uploadProgress() }}</small>
            </div>

            <div *ngFor="let d of documentos()" class="lm-row" style="padding:8px 0; border-bottom:1px solid #eee;">
              <i class="pi pi-file"></i>
              <div class="lm-grow">
                <div>{{ d.nombre }}</div>
                <small class="lm-muted">{{ formatBytes(d.tamanoBytes) }} · {{ d.mimeType }} · {{ d.fechaSubida | date: 'short' }}</small>
              </div>
              <button pButton icon="pi pi-download" [text]="true" severity="secondary" (click)="descargar(d)" pTooltip="Descargar"></button>
            </div>
            <p *ngIf="!documentos().length" class="lm-muted">Sin documentos.</p>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
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
  private msg = inject(MessageService);
  private prompt = inject(PromptService);

  protected atencion = signal<Atencion | null>(null);
  protected gestiones = signal<Gestion[]>([]);
  protected comites = signal<Comite[]>([]);
  protected documentos = signal<DocumentoMeta[]>([]);
  protected uploading = signal(false);
  protected uploadProgress = signal<string>("");
  protected tiposGestion = [
    "LlamadaTelefonica", "Email", "Reunion", "EscritoJudicial", "Audiencia",
    "Notificacion", "AnalisisDocumental", "Resolucion", "Otra",
  ];
  protected tiposGestionOpts = this.tiposGestion.map((t) => ({ label: t, value: t }));

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
        this.msg.add({ severity: "success", summary: `${file.name} subido`, life: 2000 });
        this.cargar(atencionId);
      },
      error: (err) => {
        this.uploading.set(false);
        this.uploadProgress.set("");
        this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 5000 });
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
        this.msg.add({ severity: "success", summary: "Gestión creada", life: 2000 });
        this.formGestion.reset({
          tipo: "LlamadaTelefonica",
          responsableId: AtencionDetailComponent.DEV_ADMIN_ID,
        });
        this.cargar(atencionId);
      });
  }

  async completar(gestionId: string) {
    const resultado = await this.prompt.open({
      header: "Completar gestión",
      label: "Resultado",
      placeholder: "Describe el resultado…",
      multiline: true,
      required: true,
    });
    if (!resultado) return;
    this.gestionesApi
      .completar(gestionId, { resultado })
      .subscribe(() => this.atencion() && this.cargar(this.atencion()!.id));
  }

  async convocarComite(atencionId: string) {
    const motivo = await this.prompt.open({
      header: "Convocar comité",
      label: "Motivo",
      multiline: true,
      required: true,
    });
    if (!motivo) return;
    this.comitesApi
      .convocar(atencionId, {
        motivo,
        participantesIds: [AtencionDetailComponent.DEV_ADMIN_ID],
      })
      .subscribe(() => {
        this.msg.add({ severity: "success", summary: "Comité convocado", life: 2000 });
        this.cargar(atencionId);
      });
  }

  async votar(comiteId: string, voto: "AFavor" | "EnContra" | "Abstencion") {
    const comentario = (await this.prompt.open({
      header: `Voto ${voto}`,
      label: "Comentario (opcional)",
      multiline: true,
    })) ?? undefined;
    this.comitesApi.votar(comiteId, { voto, comentario }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: `Voto ${voto} registrado`, life: 2000 });
        if (this.atencion()) this.cargar(this.atencion()!.id);
      },
      error: (err) =>
        this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }

  async cerrarComite(comiteId: string, decision: "Aprobado" | "Rechazado" | "Diferido") {
    const acta = await this.prompt.open({
      header: `Cerrar comité: ${decision}`,
      label: "Acta",
      multiline: true,
      required: true,
    });
    if (!acta) return;
    this.comitesApi.cerrar(comiteId, { decision, acta }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: `Comité cerrado: ${decision}`, life: 2500 });
        if (this.atencion()) this.cargar(this.atencion()!.id);
      },
      error: (err) =>
        this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }

  async derivar(nuevoTipo: "Asesoria" | "Juicio") {
    const motivo = await this.prompt.open({
      header: `Derivar a ${nuevoTipo}`,
      label: "Motivo",
      multiline: true,
      required: true,
    });
    if (!motivo) return;
    const a = this.atencion();
    if (!a) return;
    this.api.derivar(a.id, { nuevoTipo, motivo }).subscribe((nueva) => {
      this.msg.add({ severity: "success", summary: `Derivada: ${nueva.correlativo}`, life: 3000 });
      window.location.assign(`/atenciones/${nueva.id}`);
    });
  }

  estadoSeverity(e: string): Severity {
    if (e === "Cerrada" || e === "Archivada") return "secondary";
    if (e === "EnComite" || e === "Suspendida") return "warn";
    return "info";
  }

  decisionSeverity(d: string): Severity {
    if (d === "Aprobado") return "success";
    if (d === "Rechazado") return "danger";
    if (d === "Diferido") return "warn";
    return "secondary";
  }
}
