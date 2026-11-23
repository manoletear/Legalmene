import { Component, OnInit, computed, effect, inject, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { ButtonModule } from "primeng/button";
import { CheckboxModule } from "primeng/checkbox";
import { InputNumberModule } from "primeng/inputnumber";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TagModule } from "primeng/tag";
import { TextareaModule } from "primeng/textarea";
import { DialogModule } from "primeng/dialog";
import { MessageService } from "primeng/api";
import {
  ESTADO_LABEL,
  UMBRAL_RIESGO_COMITE,
  transicionesPermitidas,
  type AtencionConMaestros,
  type CanalContacto,
  type Competencia,
  type Materia,
  type Contraparte,
  type DerivacionRow,
  type EstadoAtencion,
  type MaestroSimple,
  type MonedaCuantia,
  type Procedimiento,
  type Tribunal,
  type UpdateAtencion,
  TIPOS_CON_VB_TERMINO,
} from "@legalmene/shared";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { MaestrosApiService } from "../../core/services/maestros.service";
import { MeService } from "../../core/services/me.service";
import { PromptService } from "../../shared/prompt.service";
import { UsuariosAdminService } from "../../core/services/usuarios-admin.service";

const CANALES: { label: string; value: CanalContacto }[] = [
  { label: "Telefónico", value: "Telefonico" },
  { label: "Presencial", value: "Presencial" },
  { label: "Correo electrónico", value: "Email" },
  { label: "Chat", value: "Chat" },
  { label: "Videoconferencia", value: "Videoconferencia" },
];
const MONEDAS: MonedaCuantia[] = ["CLP", "UF", "UTM", "USD"];

// Secciones de flujo del Anexo en la ficha: cambio de estado, datos de consulta,
// derivación, datos judiciales y contraparte.
@Component({
  selector: "lm-atencion-flujo",
  standalone: true,
  imports: [
    DialogModule,
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TagModule,
    TextareaModule,
  ],
  template: `
    <ng-container *ngIf="atencion() as a">
      <!-- Cambio de estado -->
      <div class="lm-info-card" style="margin-bottom:16px;">
        <div class="lm-info-card-header"><i class="pi pi-flag"></i> Cambiar estado</div>
        <!-- V°B° de jefatura (Anexo §VII l.904, §VIII l.1192) -->
        <div *ngIf="a.solicitudTermino as s" class="lm-small" data-testid="solicitud-termino"
          style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px; margin-bottom:10px;">
          <strong>Término solicitado</strong> por {{ nombreUsuario(s.solicitadoPorId) }} el {{ s.solicitadoEn | date: 'dd/MM/yyyy HH:mm' }}
          · causa: {{ nombreCausa(s.causaTerminoId) }}<ng-container *ngIf="s.observacion"> · {{ s.observacion }}</ng-container>.
          <span class="lm-muted">Espera el V°B° de jefatura.</span>
          <div *ngIf="puedeDarVB(s.solicitadoPorId)" class="lm-row" style="gap:8px; margin-top:8px;">
            <button pButton label="Dar V°B° y terminar" icon="pi pi-check" size="small" (click)="aprobarTermino(a)"></button>
            <button pButton label="Rechazar" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (click)="rechazarTermino(a)"></button>
          </div>
        </div>
        <div *ngIf="destinos().length === 0" class="lm-small lm-muted">
          La atención está en {{ etiqueta(a.estado) }} y no admite más cambios de estado.
        </div>
        <div *ngIf="destinos().length > 0" class="lm-row" style="flex-wrap:wrap; gap:8px;">
          <p-select
            [options]="destinos()"
            [(ngModel)]="destino"
            optionLabel="label"
            optionValue="value"
            placeholder="Nuevo estado"
            appendTo="body"
            [style]="{ width: '220px' }"
            data-testid="estado-destino"
          ></p-select>
          <p-select
            *ngIf="requiereCausa()"
            [options]="causas()"
            [(ngModel)]="causaTerminoId"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Causa de término"
            appendTo="body"
            [style]="{ width: '240px' }"
          ></p-select>
          <span *ngIf="requiereCausa()" class="lm-row" style="gap:4px; align-items:center;">
            <label class="lm-small" for="fechaTerminoEstado">Fecha de término</label>
            <input pInputText type="date" id="fechaTerminoEstado" [(ngModel)]="fechaTermino" [max]="hoy" [min]="a.createdAt.slice(0, 10)" style="width:150px;" />
          </span>
          <input pInputText [(ngModel)]="observacionEstado" placeholder="Observación (opcional)" style="flex:1; min-width:180px;" />
          <button *ngIf="!terminoConVB(a)" pButton label="Aplicar" icon="pi pi-check" [disabled]="!destino" (click)="cambiarEstado(a)"></button>
          <button *ngIf="terminoConVB(a)" pButton label="Solicitar término (V°B°)" icon="pi pi-send" [disabled]="!causaTerminoId || !!a.solicitudTermino" (click)="solicitarTermino(a)"></button>
        </div>
      </div>

      <!-- Consulta -->
      <div *ngIf="a.tipo === 'Consulta'" class="lm-info-card" style="margin-bottom:16px;">
        <div class="lm-info-card-header"><i class="pi pi-phone"></i> Datos de la consulta</div>
        <div class="lm-grid lm-grid-3" style="gap:12px;">
          <div class="lm-col">
            <label class="lm-small">Canal</label>
            <p-select [options]="canales" [(ngModel)]="consulta.canalContacto" optionLabel="label" optionValue="value" placeholder="Canal" appendTo="body" [showClear]="true"></p-select>
          </div>
          <div class="lm-col">
            <label class="lm-small">Tipo de consulta</label>
            <p-select [options]="tiposConsulta()" [(ngModel)]="consulta.tipoConsultaId" optionLabel="nombre" optionValue="id" placeholder="Tipo" appendTo="body" [showClear]="true"></p-select>
          </div>
          <div class="lm-col">
            <label class="lm-small">Código de grabación</label>
            <input pInputText [(ngModel)]="consulta.codigoGrabacion" placeholder="Ej. GRAB-2026-0001" />
          </div>
        </div>
        <div class="lm-row lm-small lm-muted" style="margin:8px 0; gap:16px;">
          <span>Inicio: {{ a.horaInicio ? (a.horaInicio | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
          <span>Término: {{ a.horaTermino ? (a.horaTermino | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
        </div>
        <label class="lm-small">Respuesta al afiliado (nota)</label>
        <textarea pTextarea rows="3" [(ngModel)]="consulta.respuesta" style="width:100%;"></textarea>
        <div class="lm-row" style="gap:8px; margin-top:8px; flex-wrap:wrap;">
          <button pButton label="Guardar" icon="pi pi-save" [outlined]="true" (click)="guardarConsulta(a)"></button>
          <button pButton label="Nuevo correlativo" icon="pi pi-plus" [outlined]="true" (click)="nuevoCorrelativo(a)"></button>
          <ng-container *ngIf="a.estado === 'Iniciada' || a.estado === 'Respondida'">
            <button pButton label="Derivar a asesoría" icon="pi pi-share-alt" severity="secondary" [outlined]="true" (click)="solicitarDerivacion(a, 'Asesoria')"></button>
            <button pButton label="Derivar a juicio" icon="pi pi-share-alt" severity="secondary" [outlined]="true" (click)="solicitarDerivacion(a, 'Juicio')"></button>
          </ng-container>
        </div>
        <div *ngIf="derivaciones().length" style="margin-top:12px;">
          <div class="lm-small" style="font-weight:600;">Derivaciones</div>
          <div *ngFor="let d of derivaciones()" class="lm-row lm-small" style="gap:8px; padding:4px 0;">
            <p-tag [value]="d.estado" [severity]="d.estado === 'Aprobada' ? 'success' : d.estado === 'Rechazada' ? 'danger' : 'warn'"></p-tag>
            <span>A {{ d.nuevoTipo === 'Asesoria' ? 'asesoría' : 'juicio' }} — {{ d.motivo }}</span>
            <span *ngIf="d.observacion" class="lm-muted">({{ d.observacion }})</span>
            <a *ngIf="d.atencionDerivadaId" [routerLink]="['/atenciones', d.atencionDerivadaId]">Ver atención →</a>
          </div>
        </div>
      </div>

      <!-- Datos judiciales -->
      <div *ngIf="a.tipo !== 'Consulta'" class="lm-info-card" style="margin-bottom:16px;">
        <div class="lm-info-card-header"><i class="pi pi-building-columns"></i> Datos {{ a.tipo === 'Juicio' ? 'judiciales' : 'de la asesoría' }}</div>
        <div class="lm-grid lm-grid-3" style="gap:12px;">
          <div *ngIf="a.tipo === 'Asesoria'" class="lm-col">
            <label class="lm-small">Organismo</label>
            <p-select [options]="organismos()" [(ngModel)]="caso.organismoId" optionLabel="nombre" optionValue="id" placeholder="Organismo" appendTo="body" [showClear]="true"></p-select>
          </div>
          <div class="lm-col">
            <label class="lm-small">Procedimiento</label>
            <p-select [options]="procedimientos()" [(ngModel)]="caso.procedimientoId" optionLabel="nombre" optionValue="id" placeholder="Procedimiento" appendTo="body" [showClear]="true"></p-select>
          </div>
          <div class="lm-col">
            <label class="lm-small" for="grabacionCaso">Código de grabación</label>
            <input pInputText id="grabacionCaso" [(ngModel)]="caso.codigoGrabacion" placeholder="Entrevista grabada (opcional)" />
          </div>
          <ng-container *ngIf="a.tipo === 'Juicio'">
            <div class="lm-col">
              <label class="lm-small">Tribunal</label>
              <p-select [options]="tribunales()" [(ngModel)]="caso.tribunalId" optionLabel="nombre" optionValue="id" placeholder="Tribunal" appendTo="body" [filter]="true" filterBy="nombre" [showClear]="true"></p-select>
            </div>
            <div class="lm-col">
              <label class="lm-small">ROL / RIT</label>
              <input pInputText [(ngModel)]="caso.rolCausa" placeholder="C-1234-2026" />
            </div>
            <div class="lm-col">
              <label class="lm-small">RUC</label>
              <input pInputText [(ngModel)]="caso.ruc" />
            </div>
            <div class="lm-col">
              <label class="lm-small">Cuantía</label>
              <div class="lm-row" style="gap:6px;">
                <p-inputNumber [(ngModel)]="cuantiaVisible" [minFractionDigits]="0" [maxFractionDigits]="caso.cuantiaMoneda === 'CLP' ? 0 : 2" [min]="0" [inputStyle]="{ width: '130px' }"></p-inputNumber>
                <p-select [options]="monedas" [(ngModel)]="caso.cuantiaMoneda" placeholder="Moneda" appendTo="body" [style]="{ width: '120px' }"></p-select>
              </div>
            </div>
            <div class="lm-col">
              <label class="lm-small">Calidad procesal</label>
              <p-select [options]="calidades()" [(ngModel)]="caso.calidadProcesalId" optionLabel="nombre" optionValue="id" placeholder="Calidad" appendTo="body" [showClear]="true"></p-select>
            </div>
          </ng-container>
        </div>
        <div *ngIf="a.tipo === 'Juicio'" class="lm-row" style="gap:12px; margin-top:12px; flex-wrap:wrap; align-items:flex-end;">
          <div class="lm-col"><label class="lm-small">Riesgo materia (0–10)</label><p-inputNumber [(ngModel)]="caso.riesgoMateria" [min]="0" [max]="10" [inputStyle]="{ width: '80px' }"></p-inputNumber></div>
          <div class="lm-col"><label class="lm-small">Riesgo cuantía</label><p-inputNumber [(ngModel)]="caso.riesgoCuantia" [min]="0" [max]="10" [inputStyle]="{ width: '80px' }"></p-inputNumber></div>
          <div class="lm-col"><label class="lm-small">Riesgo cliente</label><p-inputNumber [(ngModel)]="caso.riesgoCliente" [min]="0" [max]="10" [inputStyle]="{ width: '80px' }"></p-inputNumber></div>
          <div class="lm-col">
            <label class="lm-small">Riesgo total</label>
            <strong [style.color]="riesgoTotal() >= umbral ? '#dc2626' : '#0f172a'">{{ riesgoTotal() }}</strong>
          </div>
          <div class="lm-row" style="gap:6px;">
            <p-checkbox [(ngModel)]="caso.revisadoPorComite" [binary]="true" inputId="revComite" [disabled]="!esJefatura()"></p-checkbox>
            <label for="revComite" class="lm-small">Revisado por comité</label>
          </div>
        </div>
        <div style="margin-top:12px;">
          <button pButton label="Guardar datos" icon="pi pi-save" [outlined]="true" (click)="guardarCaso(a)"></button>
        </div>
      </div>

      <!-- Contraparte -->
      <div *ngIf="a.tipo !== 'Consulta'" class="lm-info-card" style="margin-bottom:16px;">
        <div class="lm-info-card-header"><i class="pi pi-users"></i> Contraparte</div>
        <div *ngIf="!contrapartes().length" class="lm-small lm-muted">Sin contraparte registrada.</div>
        <div *ngFor="let c of contrapartes()" class="lm-row lm-small" style="gap:8px; padding:6px 0; border-bottom:1px solid #f1f5f9;">
          <div style="flex:1;">
            <strong>{{ c.nombre }}</strong> <span class="lm-muted">{{ c.rut ?? '' }}</span>
            <div class="lm-muted" *ngIf="c.representanteLegal">Rep. legal: {{ c.representanteLegal }}</div>
            <div class="lm-muted" *ngIf="c.abogadoNombre">Abogado: {{ c.abogadoNombre }} {{ c.abogadoEmail ?? '' }} {{ c.abogadoTelefono ?? '' }}</div>
          </div>
          <button pButton icon="pi pi-trash" [text]="true" severity="danger" size="small" (click)="eliminarContraparte(a, c)"></button>
        </div>
        <div class="lm-grid lm-grid-3" style="gap:8px; margin-top:8px;">
          <input pInputText [(ngModel)]="nuevaContraparte.nombre" placeholder="Nombre o razón social" />
          <input pInputText [(ngModel)]="nuevaContraparte.rut" placeholder="RUT (opcional)" />
          <input pInputText [(ngModel)]="nuevaContraparte.representanteLegal" placeholder="Representante legal" />
          <input pInputText [(ngModel)]="nuevaContraparte.abogadoNombre" placeholder="Abogado contraparte" />
          <input pInputText [(ngModel)]="nuevaContraparte.abogadoEmail" placeholder="Email abogado" />
          <input pInputText [(ngModel)]="nuevaContraparte.abogadoTelefono" placeholder="Teléfono abogado" />
        </div>
        <div style="margin-top:8px;">
          <button pButton label="Agregar contraparte" icon="pi pi-plus" [outlined]="true" [disabled]="!nuevaContraparte.nombre" (click)="agregarContraparte(a)"></button>
        </div>
      </div>
    </ng-container>

    <!-- Anexo §VI 3.5.1: otra consulta en la misma llamada; puede tener otra competencia y materia. -->
    <p-dialog header="Nuevo correlativo" [visible]="ncVisible()" (visibleChange)="ncVisible.set($event)" [modal]="true" [style]="{ width: '520px', maxWidth: '95vw' }">
      <div class="lm-col" style="gap:12px;">
        <small class="lm-muted">Nueva consulta en la misma llamada: mismo afiliado, plan, canal y grabación.</small>
        <label class="lm-col" style="gap:4px;">Competencia *
          <p-select name="ncCompetencia" [(ngModel)]="nc.competenciaId" [options]="ncCompetencias()" optionLabel="nombre" optionValue="id"
            [filter]="true" filterBy="nombre" appendTo="body" (onChange)="ncCargarMaterias()"></p-select>
        </label>
        <label class="lm-col" style="gap:4px;">Materia *
          <p-select name="ncMateria" [(ngModel)]="nc.materiaId" [options]="ncMaterias()" optionLabel="nombre" optionValue="id"
            [filter]="true" filterBy="nombre" appendTo="body" placeholder="Seleccione" emptyMessage="La competencia no tiene materias para consultas"></p-select>
        </label>
        <label class="lm-col" style="gap:4px;">Asunto *<input pInputText name="ncAsunto" [(ngModel)]="nc.asunto" maxlength="250" /></label>
        <label class="lm-col" style="gap:4px;">Tipo de consulta
          <p-select name="ncTipo" [(ngModel)]="nc.tipoConsultaId" [options]="tiposConsulta()" optionLabel="nombre" optionValue="id" [showClear]="true" placeholder="El de esta consulta" appendTo="body"></p-select>
        </label>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button pButton label="Cancelar" [text]="true" (click)="ncVisible.set(false)"></button>
          <button pButton label="Crear correlativo" icon="pi pi-check" [disabled]="!nc.competenciaId || !nc.materiaId || !nc.asunto.trim()" [loading]="ncGuardando()" (click)="crearNuevoCorrelativo()"></button>
        </div>
      </div>
    </p-dialog>
  `,
})
export class AtencionFlujoComponent implements OnInit {
  readonly atencion = input.required<AtencionConMaestros>();
  readonly cambio = output<void>();

  private api = inject(AtencionesApiService);
  private maestros = inject(MaestrosApiService);
  private me = inject(MeService);
  private msg = inject(MessageService);
  private prompt = inject(PromptService);
  private router = inject(Router);
  private usuariosApi = inject(UsuariosAdminService);
  protected nombres = signal(new Map<string, string>());

  protected canales = CANALES;
  protected monedas = MONEDAS;
  protected umbral = UMBRAL_RIESGO_COMITE;
  protected causas = signal<MaestroSimple[]>([]);
  protected tiposConsulta = signal<MaestroSimple[]>([]);
  protected organismos = signal<MaestroSimple[]>([]);
  protected calidades = signal<MaestroSimple[]>([]);
  protected tribunales = signal<Tribunal[]>([]);
  protected procedimientos = signal<Procedimiento[]>([]);
  protected derivaciones = signal<DerivacionRow[]>([]);
  protected ncVisible = signal(false);
  protected ncGuardando = signal(false);
  protected ncCompetencias = signal<Competencia[]>([]);
  protected ncMaterias = signal<Materia[]>([]);
  protected nc = { competenciaId: "", materiaId: "", asunto: "", tipoConsultaId: null as string | null };
  private ncOrigen: AtencionConMaestros | null = null;
  protected contrapartes = signal<Contraparte[]>([]);

  protected destino: EstadoAtencion | null = null;
  protected causaTerminoId: string | null = null;
  protected observacionEstado = "";
  // Fecha real de término al abandonar o terminar (Anexo §VII l.757, §VIII l.1096); hoy por defecto.
  protected hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  protected fechaTermino = this.hoy;
  protected consulta: Partial<UpdateAtencion> = {};
  protected caso: Partial<UpdateAtencion> = {};
  protected cuantiaVisible: number | null = null;
  protected nuevaContraparte: { nombre: string; rut?: string; representanteLegal?: string; abogadoNombre?: string; abogadoEmail?: string; abogadoTelefono?: string } = { nombre: "" };

  protected esJefatura = computed(() => this.me.tiene("atenciones.revisar_comite"));
  protected destinos = computed(() => {
    const a = this.atencion();
    return transicionesPermitidas(a.tipo, a.estado).map((e) => ({ label: ESTADO_LABEL[e], value: e }));
  });

  constructor() {
    // Al recargar la atención se reinician los formularios con los valores guardados.
    effect(() => {
      const a = this.atencion();
      this.consulta = {
        canalContacto: a.canalContacto ?? null,
        tipoConsultaId: a.tipoConsultaId ?? null,
        codigoGrabacion: a.codigoGrabacion ?? null,
        respuesta: a.respuesta ?? null,
      };
      this.caso = {
        organismoId: a.organismoId ?? null,
        procedimientoId: a.procedimientoId ?? null,
        tribunalId: a.tribunalId ?? null,
        rolCausa: a.rolCausa ?? null,
        codigoGrabacion: a.codigoGrabacion ?? null,
        ruc: a.ruc ?? null,
        cuantiaMoneda: a.cuantiaMoneda ?? null,
        calidadProcesalId: a.calidadProcesalId ?? null,
        riesgoMateria: a.riesgoMateria ?? null,
        riesgoCuantia: a.riesgoCuantia ?? null,
        riesgoCliente: a.riesgoCliente ?? null,
        revisadoPorComite: a.revisadoPorComite ?? false,
      };
      this.cuantiaVisible =
        a.cuantiaMonto == null ? null : a.cuantiaMoneda === "CLP" || !a.cuantiaMoneda ? a.cuantiaMonto : a.cuantiaMonto / 100;
      this.destino = null;
      this.fechaTermino = this.hoy;
      this.causaTerminoId = a.causaTerminoId ?? null;
    });
  }

  ngOnInit() {
    const a = this.atencion();
    this.maestros.listar("causas-termino", { vigente: true }).subscribe((r) => this.causas.set(r));
    this.usuariosApi.opciones().subscribe((us) => this.nombres.set(new Map(us.map((u) => [u.id, u.nombre]))));
    if (a.tipo === "Consulta") {
      this.maestros.listar("tipos-consulta", { vigente: true }).subscribe((r) => this.tiposConsulta.set(r));
      this.cargarDerivaciones(a.id);
    } else {
      this.maestros.listar("organismos", { vigente: true }).subscribe((r) => this.organismos.set(r));
      this.maestros.listar("calidades-procesales", { vigente: true }).subscribe((r) => this.calidades.set(r));
      this.maestros.listar("tribunales", { vigente: true }).subscribe((r) => this.tribunales.set(r));
      this.maestros
        .listar("procedimientos", { vigente: true, competenciaId: a.competenciaId })
        .subscribe((r) => this.procedimientos.set(r));
      this.cargarContrapartes(a.id);
    }
  }

  protected etiqueta(e: EstadoAtencion): string {
    return ESTADO_LABEL[e];
  }

  protected requiereCausa(): boolean {
    return this.destino === "Terminada" || this.destino === "Abandonada";
  }

  protected riesgoTotal(): number {
    return (this.caso.riesgoMateria ?? 0) + (this.caso.riesgoCuantia ?? 0) + (this.caso.riesgoCliente ?? 0);
  }

  private error(err: { error?: { message?: string | string[] }; message?: string }) {
    const m = err.error?.message;
    this.msg.add({ severity: "error", summary: "No se pudo completar", detail: Array.isArray(m) ? m.join(", ") : (m ?? err.message), life: 6000 });
  }

  private ok(summary: string) {
    this.msg.add({ severity: "success", summary, life: 2500 });
    this.cambio.emit();
  }

  // Asesorías y juicios no pasan a Terminada directo: se solicita y una jefatura da el V°B°.
  protected terminoConVB(a: AtencionConMaestros): boolean {
    return this.destino === "Terminada" && (TIPOS_CON_VB_TERMINO as readonly string[]).includes(a.tipo);
  }

  protected puedeDarVB(solicitanteId: string): boolean {
    return this.me.tiene("atenciones.aprobar_termino") && this.me.user()?.id !== solicitanteId;
  }

  protected nombreUsuario(id: string): string {
    return this.nombres().get(id) ?? "otro usuario";
  }

  protected nombreCausa(id: string): string {
    return this.causas().find((c) => c.id === id)?.nombre ?? "—";
  }

  private fechaTerminoIso(): string | undefined {
    // Hoy = ahora (con hora); otro día = mediodía de ese día.
    return this.fechaTermino && this.fechaTermino !== this.hoy ? new Date(`${this.fechaTermino}T12:00:00`).toISOString() : undefined;
  }

  solicitarTermino(a: AtencionConMaestros) {
    if (!this.causaTerminoId) return;
    this.api
      .solicitarTermino(a.id, { causaTerminoId: this.causaTerminoId, fechaTermino: this.fechaTerminoIso(), observacion: this.observacionEstado || undefined })
      .subscribe({
        next: () => {
          this.observacionEstado = "";
          this.ok("Término solicitado; queda a la espera del V°B° de jefatura");
        },
        error: (e) => this.error(e),
      });
  }

  aprobarTermino(a: AtencionConMaestros) {
    this.api.aprobarTermino(a.id).subscribe({ next: () => this.ok("V°B° registrado: atención terminada"), error: (e) => this.error(e) });
  }

  async rechazarTermino(a: AtencionConMaestros) {
    const motivo = await this.prompt.open({ header: "Rechazar término", label: "Motivo (se informa al abogado)", multiline: true, required: true });
    if (!motivo) return;
    this.api.rechazarTermino(a.id, motivo.trim()).subscribe({ next: () => this.ok("Solicitud de término rechazada"), error: (e) => this.error(e) });
  }

  cambiarEstado(a: AtencionConMaestros) {
    if (!this.destino) return;
    this.api
      .cambiarEstado(a.id, {
        estado: this.destino,
        causaTerminoId: this.requiereCausa() ? (this.causaTerminoId ?? undefined) : undefined,
        observacion: this.observacionEstado || undefined,
        fechaTermino: this.requiereCausa() ? this.fechaTerminoIso() : undefined,
      })
      .subscribe({
        next: () => {
          this.observacionEstado = "";
          this.ok(`Estado cambiado a ${ESTADO_LABEL[this.destino!]}`);
        },
        error: (e) => this.error(e),
      });
  }

  guardarConsulta(a: AtencionConMaestros) {
    this.api.actualizar(a.id, this.consulta).subscribe({ next: () => this.ok("Consulta guardada"), error: (e) => this.error(e) });
  }

  guardarCaso(a: AtencionConMaestros) {
    const moneda = this.caso.cuantiaMoneda;
    const cuantiaMonto =
      this.cuantiaVisible == null ? null : moneda === "CLP" || !moneda ? Math.round(this.cuantiaVisible) : Math.round(this.cuantiaVisible * 100);
    const patch: Partial<UpdateAtencion> = { ...this.caso, cuantiaMonto };
    if (!this.esJefatura()) delete patch.revisadoPorComite;
    if (a.tipo === "Asesoria") {
      delete patch.tribunalId;
      delete patch.rolCausa;
      delete patch.ruc;
    } else {
      delete patch.organismoId;
    }
    this.api.actualizar(a.id, patch).subscribe({ next: () => this.ok("Datos guardados"), error: (e) => this.error(e) });
  }

  nuevoCorrelativo(a: AtencionConMaestros) {
    this.ncOrigen = a;
    this.nc = { competenciaId: a.competenciaId, materiaId: a.materiaId, asunto: "", tipoConsultaId: null };
    if (!this.ncCompetencias().length) {
      this.maestros.listar("competencias", { vigente: true }).subscribe((c) => this.ncCompetencias.set(c));
    }
    this.ncCargarMaterias();
    this.ncVisible.set(true);
  }

  // Materias vigentes de la competencia que aplican a consultas.
  protected ncCargarMaterias() {
    const competenciaId = this.nc.competenciaId;
    if (!competenciaId) {
      this.ncMaterias.set([]);
      this.nc.materiaId = "";
      return;
    }
    this.maestros.listar("materias", { competenciaId, vigente: true, aplicaA: "Consulta" }).subscribe((m) => {
      this.ncMaterias.set(m);
      if (!m.some((x) => x.id === this.nc.materiaId)) this.nc.materiaId = "";
    });
  }

  protected crearNuevoCorrelativo() {
    const a = this.ncOrigen;
    if (!a) return;
    this.ncGuardando.set(true);
    this.api
      .nuevoCorrelativo(a.id, {
        competenciaId: this.nc.competenciaId,
        materiaId: this.nc.materiaId,
        asunto: this.nc.asunto.trim(),
        tipoConsultaId: this.nc.tipoConsultaId,
      })
      .subscribe({
        next: (n) => {
          this.ncGuardando.set(false);
          this.ncVisible.set(false);
          this.msg.add({ severity: "success", summary: `Creada ${n.correlativo}`, life: 4000 });
          void this.router.navigate(["/atenciones", n.id]);
        },
        error: (e) => {
          this.ncGuardando.set(false);
          this.error(e);
        },
      });
  }

  async solicitarDerivacion(a: AtencionConMaestros, nuevoTipo: "Asesoria" | "Juicio") {
    const motivo = await this.prompt.open({
      header: `Solicitar derivación a ${nuevoTipo === "Asesoria" ? "asesoría" : "juicio"}`,
      label: "Motivo",
      multiline: true,
      required: true,
    });
    if (!motivo) return;
    this.api.solicitarDerivacion(a.id, { nuevoTipo, motivo }).subscribe({
      next: () => {
        this.cargarDerivaciones(a.id);
        this.ok("Derivación enviada a la jefatura");
      },
      error: (e) => this.error(e),
    });
  }

  private cargarDerivaciones(id: string) {
    this.api.listarDerivaciones({ consultaId: id }).subscribe((r) => this.derivaciones.set(r.data));
  }

  private cargarContrapartes(id: string) {
    this.api.contrapartes(id).subscribe((r) => this.contrapartes.set(r));
  }

  agregarContraparte(a: AtencionConMaestros) {
    const limpio = Object.fromEntries(
      Object.entries(this.nuevaContraparte).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]),
    ) as { nombre: string };
    this.api.crearContraparte(a.id, limpio).subscribe({
      next: () => {
        this.nuevaContraparte = { nombre: "" };
        this.cargarContrapartes(a.id);
        this.msg.add({ severity: "success", summary: "Contraparte agregada", life: 2000 });
      },
      error: (e) => this.error(e),
    });
  }

  eliminarContraparte(a: AtencionConMaestros, c: Contraparte) {
    this.api.eliminarContraparte(c.id).subscribe({ next: () => this.cargarContrapartes(a.id), error: (e) => this.error(e) });
  }
}
