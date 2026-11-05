import { PosesionPanelComponent } from "./posesion-panel.component";
import { Component, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { authHeaders } from "../../core/interceptors/auth.interceptor";
import { environment } from "../../../environments/environment";
import { CardModule } from "primeng/card";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { DividerModule } from "primeng/divider";
import { TabsModule } from "primeng/tabs";
import { MessageService } from "primeng/api";
import { PromptService } from "../../shared/prompt.service";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { GestionesApiService } from "../../core/services/gestiones.service";
import { ComitesApiService } from "../../core/services/comites.service";
import { DocumentosApiService, DocumentoMeta } from "../../core/services/documentos.service";
import { ProvisionesApiService } from "../../core/services/provisiones.service";
import { MeService } from "../../core/services/me.service";
import { PermisoDirective } from "../../core/permisos";
import { UsuariosAdminService } from "../../core/services/usuarios-admin.service";
import { AtencionFlujoComponent } from "./atencion-flujo.component";
import {
  ESTADO_LABEL,
  ETAPAS_PIPELINE,
  ESTADOS_TERMINALES,
  type FichaAtencion,
  type Comite,
  type CopagoResultado,
  type EstadoAtencion,
  type Gestion,
  type ResumenProvisionAtencion,
  type ArancelAtencion,
  type EstadoArancelAtencion,
  ESTADO_ARANCEL_COLOR,
  ESTADO_ARANCEL_LABEL,
} from "@legalmene/shared";

interface AlertaCaso {
  nivel: "critical" | "high" | "info";
  icono: string;
  titulo: string;
  detalle: string;
  etiqueta: string;
  severidad: "danger" | "warn" | "info";
}

// Días calendario desde hoy hasta la fecha (negativo si ya pasó).
function diasHasta(iso: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
}

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

interface PipelineStep {
  label: string;
  done: boolean;
  current: boolean;
  pending: boolean;
}

@Component({
  selector: "lm-atencion-detail",
  standalone: true,
  imports: [
    PosesionPanelComponent,
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PermisoDirective,
    CardModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DividerModule,
    TabsModule,
    AtencionFlujoComponent,
  ],
  template: `
    <ng-container *ngIf="atencion() as a">
      <!-- Breadcrumb -->
      <div class="lm-row" style="font-size:13px; margin-bottom:12px;">
        <a routerLink="/juicios" style="color:#64748b; text-decoration:none;">{{ rutaPrincipal(a.tipo) }}</a>
        <i class="pi pi-angle-right lm-muted" style="font-size:10px;"></i>
        <span style="color:#475569;">Ficha de Caso</span>
      </div>

      <!-- Header -->
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
        <h1 style="margin:0;">Ficha de Caso</h1>
        <span style="font-size:18px; font-weight:600; color:#0f172a;">{{ a.correlativo }}</span>
        <p-tag [value]="estadoLabel(a.estado)" [severity]="estadoSeverity(a.estado)"></p-tag>
        <span style="flex:1;"></span>
        <button pButton icon="pi pi-ellipsis-v" [outlined]="true" label="Más acciones" iconPos="right"></button>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 320px; gap:20px;">
        <div class="lm-col" style="gap:16px;">
          <!-- 8-card grid: Afiliado | Plan | Tipo | Responsable -->
          <div class="lm-grid lm-grid-4">
            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-user"></i> Datos del afiliado</div>
              <div class="lm-info-main">{{ a.afiliado.nombre }}</div>
              <div class="lm-info-row"><span>RUT</span><strong>{{ a.afiliado.rut }}</strong></div>
              <div class="lm-info-row"><span>Afiliado desde</span><strong>{{ a.afiliadoDesde ? (a.afiliadoDesde | date: 'dd/MM/yyyy') : '—' }}</strong></div>
              <div class="lm-info-row" *ngIf="a.afiliado.telefono"><span>Teléfono</span><strong>{{ a.afiliado.telefono }}</strong></div>
              <div class="lm-info-row" *ngIf="a.carga as c"><span>Atención para</span><strong>{{ c.nombre }} ({{ c.rut }})</strong></div>
              <div class="lm-info-card-footer"><a [routerLink]="['/afiliados', a.afiliadoId]">Ver ficha del afiliado →</a></div>
            </div>

            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-shield"></i> Plan y cobertura</div>
              <div class="lm-info-main">{{ a.planNombre ?? a.codPlan }}</div>
              <div class="lm-info-row"><span>Cobertura</span><strong>{{ coberturaTexto() }}</strong></div>
              <div class="lm-info-card-footer"><a routerLink="/admin/coberturas" [queryParams]="{ plan: a.codPlan }">Ver coberturas del plan →</a></div>
            </div>

            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-briefcase"></i> Tipo de atención</div>
              <div class="lm-info-main">{{ a.competenciaNombre }}</div>
              <div class="lm-info-row"><span>Materia</span><strong>{{ a.materiaNombre }}</strong></div>
              <div class="lm-info-row"><span>Prioridad</span><strong>{{ a.prioridad }}</strong></div>
              <div class="lm-info-card-footer"><a routerLink="/aranceles">Ver matriz de aranceles →</a></div>
            </div>

            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-user-edit"></i> Responsable</div>
              <ng-container *ngIf="a.responsable as r; else sinResponsable">
                <div class="lm-info-main">{{ r.nombre }}</div>
                <div class="lm-info-row"><span>Perfil</span><strong>{{ r.perfil }}</strong></div>
                <div class="lm-info-row"><span>Email</span><strong class="lm-small">{{ r.email }}</strong></div>
                <div *lmPermiso="'controller.ver'" class="lm-info-card-footer"><a routerLink="/reportes" [queryParams]="{ vista: 'controller' }">Ver carga del abogado →</a></div>
              </ng-container>
              <ng-template #sinResponsable><div class="lm-info-main lm-muted">Sin asignar</div></ng-template>
            </div>
          </div>

          <!-- 8-card grid: Estado | Fechas | Arancel | Provisión -->
          <div class="lm-grid lm-grid-4">
            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-flag"></i> Estado del caso</div>
              <div class="lm-row" style="margin:4px 0;">
                <span style="width:10px; height:10px; border-radius:50%; background:#22c55e;"></span>
                <strong style="color:#0f172a;">{{ estadoLabel(a.estado) }}</strong>
              </div>
              <div class="lm-info-row"><span>Tipo</span><strong>{{ a.tipo === 'Asesoria' ? 'Asesoría' : a.tipo }}</strong></div>
              <div class="lm-info-row" *ngIf="a.tipo === 'Juicio'"><span>Riesgo</span><strong>{{ a.riesgoTotal }}</strong></div>
            </div>

            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-calendar"></i> Fechas clave</div>
              <div class="lm-info-row"><span>Ingreso</span><strong>{{ a.fechaApertura | date: 'dd/MM/yyyy' }}</strong></div>
              <div class="lm-info-row"><span>Última gestión</span><strong>{{ a.fechaUltimaGestion ? (a.fechaUltimaGestion | date: 'dd/MM/yyyy') : '—' }}</strong></div>
              <div class="lm-info-row"><span>Próxima audiencia</span><strong>{{ proximaAudiencia() ? (proximaAudiencia() | date: 'dd/MM/yyyy HH:mm') : '—' }}</strong></div>
            </div>

            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-dollar"></i> Arancel</div>
              <ng-container *ngIf="copago() as c">
                <ng-container *ngIf="c.arancel as ar; else sinArancel">
                  <div class="lm-info-row"><span>Código arancel</span><strong>{{ ar.codigo }}</strong></div>
                  <div class="lm-info-row"><span>Descripción</span><strong class="lm-small">{{ ar.descripcion }}</strong></div>
                  <div class="lm-info-row"><span>Valor</span><strong>{{ ar.valorUfCentesimas / 100 | number: '1.0-2' }} UF</strong></div>
                </ng-container>
                <ng-template #sinArancel>
                  <div class="lm-small lm-muted" style="margin:4px 0 8px;">Sin arancel definido para esta materia</div>
                </ng-template>
                <div class="lm-info-row" *ngIf="c.copagoUfCentesimas !== null">
                  <span>Copago afiliado</span>
                  <strong [style.color]="c.requiereCopago ? '#b45309' : '#16a34a'">
                    {{ c.copagoUfCentesimas / 100 | number: '1.0-2' }} UF{{ c.copagoClp !== null ? ' · $ ' + (c.copagoClp | number) : '' }}
                  </strong>
                </div>
              </ng-container>
              <ng-container *ngIf="arancel() as ar">
                <div class="lm-row" style="gap:6px; margin-top:6px;" data-testid="arancel-estado">
                  <span style="width:10px; height:10px; border-radius:50%;" [style.background]="colorArancel(ar.estado)"></span>
                  <strong class="lm-small">{{ etiquetaArancel(ar.estado) }}</strong>
                </div>
                <div *ngIf="ar.motivoRechazo && ar.estado === 'Requerido'" class="lm-small" style="color:#dc2626;">Rechazado: {{ ar.motivoRechazo }}</div>
                <div *ngIf="ar.estado === 'Pagado'" class="lm-small lm-muted">
                  Pagado {{ ar.fechaPago | date: 'dd/MM/yyyy' }} · {{ ar.medioPago }} · $ {{ ar.montoClp | number }}
                </div>
                <div class="lm-row" style="gap:4px; flex-wrap:wrap; margin-top:6px;">
                  <button *ngIf="ar.estado === 'Requerido' && me.tiene('aranceles_atencion.enviar')" pButton size="small" [outlined]="true" label="Enviar a aprobación" (click)="accionArancel(a.id, 'enviar')"></button>
                  <ng-container *ngIf="ar.estado === 'EnAprobacion' && me.tiene('aranceles_atencion.aprobar')">
                    <button pButton size="small" severity="success" [outlined]="true" label="Aprobar" (click)="accionArancel(a.id, 'aprobar')"></button>
                    <button pButton size="small" severity="danger" [outlined]="true" label="Rechazar" (click)="accionArancel(a.id, 'rechazar')"></button>
                  </ng-container>
                  <button *ngIf="ar.estado === 'Aprobado' && me.tiene('aranceles_atencion.registrar_pago')" pButton size="small" [outlined]="true" label="Registrar pago" (click)="accionArancel(a.id, 'pago')"></button>
                </div>
              </ng-container>
            </div>

            <div class="lm-info-card">
              <div class="lm-info-card-header"><i class="pi pi-wallet"></i> Provisión</div>
              <ng-container *ngIf="resumenProvision() as r">
                <div class="lm-info-row"><span>Provisionado (pagado)</span><strong>$ {{ r.provisionado | number }}</strong></div>
                <div class="lm-info-row"><span>Entregado al abogado</span><strong>$ {{ r.entregado | number }}</strong></div>
                <div class="lm-info-row"><span>Gastado</span><strong>$ {{ r.utilizado | number }}</strong></div>
                <div *ngIf="r.reintegrado > 0" class="lm-info-row"><span>Devuelto</span><strong>$ {{ r.reintegrado | number }}</strong></div>
                <div class="lm-info-row"><span>Saldo por rendir</span><strong [style.color]="r.saldoPorRendir > 0 ? '#b45309' : '#16a34a'">$ {{ r.saldoPorRendir | number }}</strong></div>
                <div *ngIf="r.pendientePago > 0" class="lm-info-row"><span>Pendiente de pago</span><strong style="color:#b45309;">$ {{ r.pendientePago | number }}</strong></div>
              </ng-container>
              <div class="lm-info-card-footer">
                <a style="cursor:pointer;" (click)="solicitarProvision(a.id)">Solicitar provisión</a> ·
                <a routerLink="/provisiones">Ver provisiones →</a>
              </div>
            </div>
          </div>

          <lm-atencion-flujo [atencion]="a" (cambio)="cargar(a.id)"></lm-atencion-flujo>

          <!-- Pipeline horizontal -->
          <p-card>
            <div class="lm-pipeline">
              <div *ngFor="let step of pipeline()" class="lm-pipeline-step" [class.done]="step.done" [class.current]="step.current">
                <div class="lm-step-dot">
                  <i *ngIf="step.done" class="pi pi-check" style="font-size:12px;"></i>
                  <i *ngIf="step.current" class="pi pi-circle-fill" style="font-size:10px;"></i>
                </div>
                <strong style="font-size:12px;">{{ step.label }}</strong>
                <small *ngIf="step.current" style="color:#2563eb; font-weight:600;">Actual</small>
                <small *ngIf="step.pending" class="lm-muted">Pendiente</small>
              </div>
            </div>
          </p-card>

          <lm-posesion-panel *ngIf="a.tipo === 'PosesionEfectiva'" [atencionId]="a.id" [correlativo]="a.correlativo"
            [cerrada]="a.estado === 'Terminada' || a.estado === 'Abandonada'"></lm-posesion-panel>

          <!-- Tabs -->
          <p-card>
            <p-tabs value="gestiones">
              <p-tablist>
                <p-tab value="resumen">Resumen</p-tab>
                <p-tab value="gestiones">Gestiones</p-tab>
                <p-tab value="documentos">Documentos</p-tab>
                <p-tab value="comite">Comité</p-tab>
                <p-tab value="historial">Historial</p-tab>
              </p-tablist>
              <p-tabpanels>
                <p-tabpanel value="resumen">
                  <p *ngIf="a.descripcion">{{ a.descripcion }}</p>
                  <p *ngIf="!a.descripcion" class="lm-muted">Sin descripción registrada.</p>
                </p-tabpanel>

                <p-tabpanel value="gestiones">
                  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                    <h3 style="margin:0;">Gestiones del caso</h3>
                    <div class="lm-row">
                      <button pButton icon="pi pi-filter" [text]="true" severity="secondary"></button>
                      <button pButton icon="pi pi-plus" label="Nueva gestión" (click)="abrirNuevaGestion(a.id)"></button>
                    </div>
                  </div>
                  <table style="width:100%; border-collapse:collapse;">
                    <thead>
                      <tr style="text-align:left; color:#94a3b8; font-size:11px; text-transform:uppercase; border-bottom:1px solid #e2e8f0;">
                        <th style="padding:8px 4px;">Fecha</th>
                        <th style="padding:8px 4px;">Gestión</th>
                        <th style="padding:8px 4px;">Responsable</th>
                        <th style="padding:8px 4px;">Estado</th>
                        <th style="padding:8px 4px; width:32px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let g of gestiones()" style="border-bottom:1px solid #f1f5f9; font-size:13px;">
                        <td style="padding:10px 4px;">
                          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px;" [style.background]="g.estado === 'Completada' ? '#22c55e' : '#3b82f6'"></span>
                          {{ g.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                        </td>
                        <td style="padding:10px 4px;">{{ g.titulo }}</td>
                        <td style="padding:10px 4px; color:#475569;">{{ nombreUsuario(g.responsableId) }}</td>
                        <td style="padding:10px 4px;"><p-tag [value]="g.estado === 'Completada' ? 'Realizada' : g.estado === 'Pendiente' ? 'Programada' : g.estado" [severity]="g.estado === 'Completada' ? 'success' : 'info'"></p-tag></td>
                        <td style="padding:10px 4px;"><button pButton icon="pi pi-ellipsis-v" [text]="true" severity="secondary" size="small"></button></td>
                      </tr>
                      <tr *ngIf="!gestiones().length"><td colspan="5" class="lm-muted" style="text-align:center; padding:24px;">Sin gestiones registradas.</td></tr>
                    </tbody>
                  </table>
                  <div style="text-align:center; padding-top:12px;">
                    <a style="color:#2563eb; font-size:13px; font-weight:500; cursor:pointer;">Ver todas las gestiones →</a>
                  </div>
                </p-tabpanel>

                <p-tabpanel value="documentos">
                  <div *ngIf="!documentos().length" class="lm-muted">Sin documentos.</div>
                  <div *ngFor="let d of documentos()" class="lm-row" style="padding:8px 0; border-bottom:1px solid #f1f5f9;">
                    <i class="pi pi-file"></i>
                    <div style="flex:1;">
                      <div>{{ d.nombre }}</div>
                      <small class="lm-muted">{{ formatBytes(d.tamanoBytes) }} · {{ d.fechaSubida | date: 'short' }}</small>
                    </div>
                    <button pButton icon="pi pi-download" [text]="true" severity="secondary" (click)="descargar(d)"></button>
                  </div>
                </p-tabpanel>

                <p-tabpanel value="comite">
                  <div class="lm-row" style="margin-bottom:12px;">
                    <button pButton [outlined]="true" label="Convocar comité" (click)="convocarComite(a.id)"></button>
                  </div>
                  <div *ngFor="let c of comites()" style="margin-bottom:12px; padding:12px; border:1px solid #e2e8f0; border-radius:8px;">
                    <div class="lm-row">
                      <strong>Comité del {{ c.fechaConvocatoria | date: 'short' }}</strong>
                      <p-tag [value]="c.estado"></p-tag>
                      <p-tag [value]="c.decision" [severity]="decisionSeverity(c.decision)"></p-tag>
                    </div>
                    <p class="lm-small" style="margin:8px 0 0;">{{ c.motivo }}</p>
                  </div>
                </p-tabpanel>

                <p-tabpanel value="historial">
                  <p class="lm-muted">Historial completo de la atención disponible en Auditoría.</p>
                  <a routerLink="/auditoria" style="color:#2563eb;">Ir a Auditoría →</a>
                </p-tabpanel>
              </p-tabpanels>
            </p-tabs>
          </p-card>
        </div>

        <!-- Side rail derecho -->
        <div class="lm-col" style="gap:16px;">
          <p-card *ngIf="alertas().length > 0">
            <ng-template pTemplate="header">
              <div class="lm-row" style="padding:16px 16px 0;">
                <h3 style="margin:0; flex:1;">Alertas</h3>
                <p-tag [value]="'' + alertas().length" severity="danger"></p-tag>
              </div>
            </ng-template>
            <div *ngFor="let al of alertas()" class="lm-alert-row">
              <div class="lm-alert-icon" [ngClass]="al.nivel"><i class="pi {{ al.icono }}"></i></div>
              <div style="flex:1;">
                <div style="font-size:13px; color:#475569;">{{ al.titulo }}</div>
                <small class="lm-muted">{{ al.detalle }}</small>
              </div>
              <p-tag [value]="al.etiqueta" [severity]="al.severidad"></p-tag>
            </div>
          </p-card>

          <p-card *ngIf="vencimientos().length > 0">
            <ng-template pTemplate="header">
              <div style="padding:16px 16px 0;">
                <h3 style="margin:0;">Próximos vencimientos</h3>
              </div>
            </ng-template>
            <div class="lm-col" style="gap:10px;">
              <div *ngFor="let v of vencimientos()" class="lm-row">
                <i class="pi pi-calendar" style="color:#2563eb;"></i>
                <div style="flex:1;">
                  <div style="font-size:13px; color:#0f172a; font-weight:500;">{{ v.fecha | date: 'dd/MM/yyyy HH:mm' }}</div>
                  <small class="lm-muted">{{ v.titulo }}</small>
                </div>
                <p-tag [value]="v.distancia" [severity]="v.vencida ? 'danger' : 'info'"></p-tag>
              </div>
            </div>
          </p-card>

          <p-card>
            <ng-template pTemplate="header">
              <div style="padding:16px 16px 0;">
                <h3 style="margin:0;">Acciones rápidas</h3>
              </div>
            </ng-template>
            <div class="lm-col" style="gap:8px;">
              <button pButton icon="pi pi-upload" label="Subir documento" [text]="true" severity="secondary"></button>
              <button pButton icon="pi pi-pencil" label="Registrar gestión" [text]="true" severity="secondary" (click)="abrirNuevaGestion(a.id)"></button>
              <button pButton icon="pi pi-dollar" label="Agregar gasto" [text]="true" severity="secondary"></button>
              <button pButton icon="pi pi-calendar" label="Solicitar audiencia" [text]="true" severity="secondary"></button>
              <button pButton icon="pi pi-comment" label="Enviar comunicación" [text]="true" severity="secondary"></button>
              <a style="color:#2563eb; font-size:13px; font-weight:500; text-align:center; cursor:pointer; padding-top:8px;">Ver más acciones →</a>
            </div>
          </p-card>

          <p-card>
            <ng-template pTemplate="header">
              <div style="padding:16px 16px 0;">
                <h3 style="margin:0;">Documentos recientes</h3>
              </div>
            </ng-template>
            <div class="lm-col" style="gap:8px;">
              <div *ngFor="let d of documentos().slice(0, 3)" class="lm-row">
                <i class="pi pi-file" style="color:#dc2626;"></i>
                <span style="flex:1; font-size:13px; color:#0f172a;">{{ d.nombre }}</span>
                <small class="lm-muted">{{ d.fechaSubida | date: 'dd/MM/yyyy' }}</small>
              </div>
              <a style="color:#2563eb; font-size:13px; font-weight:500; text-align:center; cursor:pointer; padding-top:8px;">Ver todos los documentos →</a>
            </div>
          </p-card>
        </div>
      </div>
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
  private provisionesApi = inject(ProvisionesApiService);
  protected me = inject(MeService);
  private usuariosApi = inject(UsuariosAdminService);
  private nombres = signal(new Map<string, string>());

  protected nombreUsuario(id: string | null | undefined): string {
    return (id && this.nombres().get(id)) || "—";
  }

  protected atencion = signal<FichaAtencion | null>(null);
  protected resumenProvision = signal<ResumenProvisionAtencion | null>(null);
  protected copago = signal<CopagoResultado | null>(null);
  protected arancel = signal<ArancelAtencion | null>(null);
  protected coberturaTexto = computed(() => {
    const c = this.copago();
    if (!c) return "—";
    if (c.modalidad === "Porcentaje") return `${c.cobertura?.porcentaje ?? 0}% del arancel`;
    if (c.modalidad === "ValorUF") return `Precio fijo ${(c.cobertura?.valorUfCentesimas ?? 0) / 100} UF`;
    return "Sin cobertura";
  });
  protected gestiones = signal<Gestion[]>([]);
  protected comites = signal<Comite[]>([]);
  protected documentos = signal<DocumentoMeta[]>([]);
  protected uploading = signal(false);
  protected tiposGestion = [
    "LlamadaTelefonica", "Email", "Reunion", "EscritoJudicial", "Audiencia",
    "Notificacion", "AnalisisDocumental", "Resolucion", "Otra",
  ];

  protected formGestion = this.fb.group({
    tipo: ["LlamadaTelefonica", Validators.required],
    titulo: ["", [Validators.required, Validators.maxLength(200)]],
    detalle: [""],
  });

  // Responsable por defecto: el abogado del caso o, si no tiene, el usuario actual.
  private responsableId(): string | undefined {
    return this.atencion()?.abogadoAsignadoId ?? this.me.user()?.id;
  }

  private pendientesConPlazo = computed(() =>
    this.gestiones()
      .filter((g) => g.estado === "Pendiente" && g.fechaCompromiso)
      .sort((x, y) => new Date(x.fechaCompromiso!).getTime() - new Date(y.fechaCompromiso!).getTime()),
  );

  protected vencimientos = computed(() =>
    this.pendientesConPlazo()
      .slice(0, 5)
      .map((g) => {
        const dias = diasHasta(g.fechaCompromiso!);
        return {
          fecha: g.fechaCompromiso!,
          titulo: g.titulo,
          vencida: dias < 0,
          distancia: dias < 0 ? `Vencida hace ${-dias} d` : dias === 0 ? "Hoy" : `En ${dias} d`,
        };
      }),
  );

  protected proximaAudiencia = computed(
    () =>
      this.pendientesConPlazo().find((g) => g.tipo === "Audiencia" && diasHasta(g.fechaCompromiso!) >= 0)?.fechaCompromiso ?? null,
  );

  // Alertas derivadas de datos reales: plazos de gestiones, arancel por pagar y provisiones.
  protected alertas = computed<AlertaCaso[]>(() => {
    const out: AlertaCaso[] = [];
    for (const g of this.pendientesConPlazo()) {
      const dias = diasHasta(g.fechaCompromiso!);
      if (dias > 7) continue;
      const fecha = new Date(g.fechaCompromiso!).toLocaleDateString("es-CL");
      if (dias < 0) out.push({ nivel: "critical", icono: "pi-clock", titulo: `${g.titulo}: plazo vencido`, detalle: fecha, etiqueta: "Crítico", severidad: "danger" });
      else
        out.push({
          nivel: dias <= 3 ? "critical" : "high",
          icono: "pi-clock",
          titulo: `${g.titulo}: vence ${dias === 0 ? "hoy" : `en ${dias} días`}`,
          detalle: fecha,
          etiqueta: dias <= 3 ? "Crítico" : "Alto",
          severidad: dias <= 3 ? "danger" : "warn",
        });
    }
    const ar = this.arancel();
    if (ar && ["Requerido", "EnAprobacion", "Aprobado"].includes(ar.estado)) {
      out.push({ nivel: "high", icono: "pi-dollar", titulo: `Arancel ${ESTADO_ARANCEL_LABEL[ar.estado].toLowerCase()}`, detalle: "El caso espera el pago del copago", etiqueta: "Alto", severidad: "warn" });
    }
    const r = this.resumenProvision();
    if (r && r.saldoPorRendir > 0) {
      out.push({ nivel: "info", icono: "pi-wallet", titulo: "Provisión con saldo por rendir", detalle: `$ ${r.saldoPorRendir.toLocaleString("es-CL")}`, etiqueta: "Informativo", severidad: "info" });
    }
    if (r && r.pendientePago > 0) {
      out.push({ nivel: "info", icono: "pi-wallet", titulo: "Provisión pendiente de pago del cliente", detalle: `$ ${r.pendientePago.toLocaleString("es-CL")}`, etiqueta: "Informativo", severidad: "info" });
    }
    return out;
  });

  // Pipeline de etapas definido junto al mapa de transiciones (shared/estados-atencion).
  protected pipeline = computed<PipelineStep[]>(() => {
    const a = this.atencion();
    if (!a) return [];
    const etapas = ETAPAS_PIPELINE[a.tipo];
    const terminal = ESTADOS_TERMINALES.includes(a.estado);
    // Los estados de espera se muestran sobre la etapa "Pendiente".
    const actual = etapas.includes(a.estado) ? a.estado : a.estado.startsWith("EnEspera") ? "Pendiente" : null;
    const idx = actual ? etapas.indexOf(actual) : terminal ? etapas.length : 0;
    return etapas.map((e, i) => ({
      label: i === idx && actual !== a.estado ? `${ESTADO_LABEL[e]} · ${ESTADO_LABEL[a.estado]}` : ESTADO_LABEL[e],
      done: i < idx || (a.estado === "Terminada" && i === idx),
      current: i === idx && a.estado !== "Terminada",
      pending: i > idx,
    }));
  });

  ngOnInit() {
    this.usuariosApi.opciones().subscribe((us) => this.nombres.set(new Map(us.map((u) => [u.id, u.nombre]))));
    const id = this.route.snapshot.paramMap.get("id");
    if (id) this.cargar(id);
  }

  cargar(id: string) {
    this.api.obtener(id).subscribe((a) => this.atencion.set(a));
    this.gestionesApi.listar(id).subscribe((g) => this.gestiones.set(g));
    this.comitesApi.listar(id).subscribe((c) => this.comites.set(c));
    this.documentosApi.listar(id).subscribe((d) => this.documentos.set(d));
    this.api.copago(id).subscribe({ next: (c) => this.copago.set(c), error: () => this.copago.set(null) });
    this.api.arancel(id).subscribe({ next: (r) => this.arancel.set(r), error: () => this.arancel.set(null) });
    this.cargarProvisiones(id);
  }

  private cargarProvisiones(id: string) {
    this.provisionesApi.porAtencion(id).subscribe((r) => this.resumenProvision.set(r.resumen));
  }

  async solicitarProvision(atencionId: string) {
    const montoTxt = await this.prompt.open({ header: "Solicitar provisión", label: "Monto en pesos", required: true });
    if (!montoTxt) return;
    const monto = Number(montoTxt.replace(/[.\s$]/g, ""));
    if (!Number.isInteger(monto) || monto <= 0) {
      this.msg.add({ severity: "warn", summary: "Monto inválido", life: 3000 });
      return;
    }
    const motivo = await this.prompt.open({ header: "Motivo de la provisión", label: "Motivo", multiline: true, required: true });
    if (!motivo) return;
    this.provisionesApi.solicitar(atencionId, { monto, motivo }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Provisión solicitada", detail: "Queda pendiente del pago del cliente", life: 3000 });
        this.cargarProvisiones(atencionId);
      },
      error: (err) => this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
    });
  }

  protected colorArancel(e: EstadoArancelAtencion): string {
    return ESTADO_ARANCEL_COLOR[e];
  }

  protected etiquetaArancel(e: EstadoArancelAtencion): string {
    return ESTADO_ARANCEL_LABEL[e];
  }

  async accionArancel(atencionId: string, accion: "enviar" | "aprobar" | "rechazar" | "pago") {
    let req;
    if (accion === "enviar") req = this.api.enviarArancel(atencionId);
    else if (accion === "aprobar") req = this.api.aprobarArancel(atencionId);
    else if (accion === "rechazar") {
      const motivo = await this.prompt.open({ header: "Rechazar arancel", label: "Motivo", multiline: true, required: true });
      if (!motivo) return;
      req = this.api.rechazarArancel(atencionId, motivo);
    } else {
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
      const fecha = await this.prompt.open({ header: "Registrar pago del arancel", label: "Fecha de pago (AAAA-MM-DD)", initialValue: hoy, required: true });
      if (!fecha) return;
      const medio = await this.prompt.open({ header: "Medio de pago", label: "WebPay, CasaCentral o Transferencia", initialValue: "CasaCentral", required: true });
      if (!medio) return;
      if (!["WebPay", "CasaCentral", "Transferencia"].includes(medio.trim())) {
        this.msg.add({ severity: "warn", summary: "Medio inválido", detail: "Use WebPay, CasaCentral o Transferencia", life: 4000 });
        return;
      }
      req = this.api.pagarArancel(atencionId, { fechaPago: fecha.trim(), medio: medio.trim() as "CasaCentral" });
    }
    req.subscribe({
      next: (r) => {
        this.arancel.set(r);
        this.msg.add({ severity: "success", summary: `Arancel: ${ESTADO_ARANCEL_LABEL[r.estado]}`, life: 2500 });
      },
      error: (err) => this.msg.add({ severity: "error", summary: "No se pudo completar", detail: err.error?.message ?? err.message, life: 6000 }),
    });
  }

  rutaPrincipal(tipo: string): string {
    if (tipo === "Consulta") return "Consultas";
    if (tipo === "Asesoria") return "Asesorías";
    return "Juicios";
  }

  estadoLabel(e: EstadoAtencion): string {
    return ESTADO_LABEL[e] ?? e;
  }

  estadoSeverity(e: EstadoAtencion): Severity {
    if (e === "Terminada") return "success";
    if (e === "Abandonada" || e === "Derivada") return "secondary";
    if (e.startsWith("EnEspera") || e === "EnComite") return "warn";
    return "info";
  }

  decisionSeverity(d: string): Severity {
    if (d === "Aprobado") return "success";
    if (d === "Rechazado") return "danger";
    if (d === "Diferido") return "warn";
    return "secondary";
  }

  formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  descargar(doc: DocumentoMeta) {
    this.documentosApi.getDownloadUrl(doc.id).subscribe(({ url }) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.nombre;
      a.click();
    });
  }

  async abrirNuevaGestion(atencionId: string) {
    const titulo = await this.prompt.open({
      header: "Nueva gestión",
      label: "Título",
      required: true,
    });
    if (!titulo) return;
    this.gestionesApi
      .crear(atencionId, {
        tipo: "LlamadaTelefonica",
        titulo,
        responsableId: this.responsableId()!,
        documentosIds: [],
      })
      .subscribe(() => {
        this.msg.add({ severity: "success", summary: "Gestión creada", life: 2000 });
        this.cargar(atencionId);
      });
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
      .convocar(atencionId, { motivo, participantesIds: [this.me.user()?.id ?? ""].filter(Boolean) })
      .subscribe(() => {
        this.msg.add({ severity: "success", summary: "Comité convocado", life: 2000 });
        this.cargar(atencionId);
      });
  }

  descargarPdf(atencionId: string) {
    fetch(`${environment.apiBaseUrl}/exports/atenciones/${atencionId}.pdf`, {
      headers: authHeaders(),
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
}
