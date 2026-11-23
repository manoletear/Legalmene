import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { CardModule } from "primeng/card";
import { InputTextModule } from "primeng/inputtext";
import { TextareaModule } from "primeng/textarea";
import { SelectModule } from "primeng/select";
import { ButtonModule } from "primeng/button";
import { MessageService } from "primeng/api";
import { forkJoin, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { PermisoDirective } from "../../core/permisos";
import { AfiliadoFormComponent } from "../afiliados/afiliado-form.component";
import { AtencionesApiService } from "../../core/services/atenciones.service";
import { AfiliadosApiService } from "../../core/services/afiliados.service";
import { MaestrosApiService } from "../../core/services/maestros.service";
import { CoberturasApiService } from "../../core/services/coberturas.service";
import { PARENTESCO_LABEL, PLANES_SIN_COBERTURA, type CargaAfiliado } from "@legalmene/shared";
import type { Afiliado, AfiliadoConPlanes, CanalContacto, Competencia, CopagoResultado, MaestroSimple, Materia, TipoAtencion } from "@legalmene/shared";

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
    PermisoDirective,
    AfiliadoFormComponent,
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

        <!-- Anexo §VI: el afiliado se busca por RUT, sin lista precargada. -->
        <div class="lm-col" style="gap:4px;">
          <label for="rutAfiliado">RUT del afiliado</label>
          <div class="lm-row" style="gap:8px;">
            <input pInputText id="rutAfiliado" name="rutAfiliado" [value]="rutBuscado()" (input)="rutBuscado.set($any($event.target).value)"
              (keydown.enter)="$event.preventDefault(); buscarRut()" placeholder="12.345.678-5" style="flex:1;" />
            <button pButton type="button" icon="pi pi-search" label="Buscar" [outlined]="true" (click)="buscarRut()" [loading]="buscandoRut()"></button>
          </div>
          <div *ngIf="afiliado() as a" class="lm-small" data-testid="afiliado-encontrado">
            <i class="pi pi-user"></i> <strong>{{ a.nombres }} {{ a.apellidoPaterno }} {{ a.apellidoMaterno }}</strong>
            <span class="lm-muted"> · {{ a.rut }}</span>
          </div>
          <div *ngIf="rutNoRegistrado()" class="lm-small" role="status">
            <span class="lm-muted">El RUT {{ rutNoRegistrado() }} no está registrado.</span>
            <button *lmPermiso="'afiliados.crear'" pButton type="button" [text]="true" size="small" icon="pi pi-user-plus"
              label="Registrar afiliado" (click)="altaRapida.set(true)"></button>
          </div>
          <small *ngIf="errorRut()" style="color:var(--p-red-600,#c62828);" role="alert">{{ errorRut() }}</small>
        </div>
        <lm-afiliado-form [visible]="altaRapida()" [rutInicial]="rutNoRegistrado() ?? ''" (cerrar)="altaRapida.set(false)"
          (guardado)="afiliadoCreado($event)"></lm-afiliado-form>

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
            (onChange)="planManual = true; codPlanSel.set($event.value ?? ''); form.patchValue({ cargaId: null }); previsualizarCopago()"
          ></p-select>
          <small *ngIf="planSugerido()" class="lm-muted">Se sugiere el plan vigente con menor copago para esta materia.</small>
          <small *ngIf="sinPlanVigente()" class="lm-muted">
            El RUT no tiene planes vigentes: la atención se registra como Rezagado o MetLife.
          </small>
        </div>
        <div class="lm-col" style="gap:4px;" *ngIf="cargaOpts().length">
          <label>Atención para una carga</label>
          <p-select formControlName="cargaId" [options]="cargaOpts()" optionLabel="label" optionValue="value" appendTo="body"
            placeholder="El titular" [showClear]="true"></p-select>
          <small class="lm-muted">Cargas vigentes del titular en el plan elegido.</small>
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
            (onChange)="elegirMejorPlan()"
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
        </ng-container>

        <div class="lm-col" style="gap:4px;">
          <label for="codigoGrabacion">Código de grabación</label>
          <input pInputText id="codigoGrabacion" type="text" formControlName="codigoGrabacion" placeholder="Opcional (llamada o entrevista grabada)" />
        </div>

        <ng-container *ngIf="form.value.tipo === 'PosesionEfectiva'">
          <h3 style="margin:8px 0 0;">Causante</h3>
          <small class="lm-muted">Puede completarse después en la ficha; se exige para pasar a "En preparación".</small>
          <div class="lm-row" style="gap:12px; flex-wrap:wrap;">
            <div class="lm-col" style="gap:4px; flex:2; min-width:220px;">
              <label>Nombre del causante</label>
              <input pInputText formControlName="causanteNombre" />
            </div>
            <div class="lm-col" style="gap:4px; flex:1; min-width:160px;">
              <label>RUT del causante</label>
              <input pInputText formControlName="causanteRut" placeholder="12.345.678-5" />
            </div>
            <div class="lm-col" style="gap:4px; flex:1; min-width:160px;">
              <label>Fecha de defunción</label>
              <input pInputText type="date" formControlName="causanteFechaDefuncion" />
            </div>
          </div>
          <div class="lm-col" style="gap:4px;">
            <label>Último domicilio</label>
            <input pInputText formControlName="causanteUltimoDomicilio" />
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
  private route = inject(ActivatedRoute);
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

  protected afiliado = signal<AfiliadoConPlanes | null>(null);
  protected rutBuscado = signal("");
  protected buscandoRut = signal(false);
  protected rutNoRegistrado = signal<string | null>(null);
  protected errorRut = signal<string | null>(null);
  protected altaRapida = signal(false);
  protected planSugerido = signal(false);
  // true cuando el usuario eligió el plan a mano: ya no se sugiere otro.
  protected planManual = false;
  protected planOpts = signal<{ label: string; value: string; disabled: boolean }[]>([]);
  protected sinPlanVigente = signal(false);
  protected saving = signal(false);

  protected tipoOpts = [
    { label: "Consulta", value: "Consulta" },
    { label: "Asesoría", value: "Asesoria" },
    { label: "Juicio", value: "Juicio" },
    { label: "Posesión efectiva", value: "PosesionEfectiva" },
  ];
  protected cargas = signal<CargaAfiliado[]>([]);
  protected codPlanSel = signal<string>("");
  protected cargaOpts = computed(() =>
    this.cargas()
      .filter((c) => c.vigente && c.codPlan === this.codPlanSel())
      .map((c) => ({ label: `${c.nombres} ${c.apellidoPaterno} (${c.rut}${c.parentesco ? " · " + PARENTESCO_LABEL[c.parentesco] : ""})`, value: c.id })),
  );
  protected prioridadOpts = [
    { label: "Baja", value: "Baja" },
    { label: "Media", value: "Media" },
    { label: "Alta", value: "Alta" },
    { label: "Urgente", value: "Urgente" },
  ];

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
    cargaId: [null as string | null],
    causanteNombre: [""],
    causanteRut: [""],
    causanteFechaDefuncion: [""],
    causanteUltimoDomicilio: [""],
  });

  constructor() {
    // ?tipo=PosesionEfectiva (desde la búsqueda de posesiones) preselecciona el tipo.
    const tipo = this.route.snapshot.queryParamMap.get("tipo");
    if (tipo && this.tipoOpts.some((o) => o.value === tipo)) this.form.patchValue({ tipo });
    const rut = this.route.snapshot.queryParamMap.get("rut");
    if (rut) {
      this.rutBuscado.set(rut);
      this.buscarRut();
    }
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
        this.elegirMejorPlan();
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

  buscarRut() {
    const rut = this.rutBuscado().replace(/[.\s]/g, "").toUpperCase();
    this.errorRut.set(null);
    this.rutNoRegistrado.set(null);
    this.afiliado.set(null);
    this.form.patchValue({ afiliadoId: "" });
    this.cargarPlanes(null);
    if (!/^\d{1,8}-[\dK]$/.test(rut)) {
      this.errorRut.set("Ingrese un RUT con formato 12.345.678-5");
      return;
    }
    this.buscandoRut.set(true);
    this.afiliadosApi.porRut(rut).subscribe({
      next: (a) => {
        this.buscandoRut.set(false);
        if (a.vigencia === "Eliminado") {
          this.errorRut.set(`El afiliado ${a.rut} está eliminado; restáurelo antes de atenderlo.`);
          return;
        }
        this.usarAfiliado(a);
      },
      error: (err) => {
        this.buscandoRut.set(false);
        if (err.status === 404) this.rutNoRegistrado.set(rut);
        else this.errorRut.set(err.error?.message ?? err.message);
      },
    });
  }

  afiliadoCreado(a: Afiliado) {
    this.altaRapida.set(false);
    this.rutNoRegistrado.set(null);
    this.rutBuscado.set(a.rut);
    this.afiliadosApi.obtener(a.id).subscribe((afi) => this.usarAfiliado(afi));
  }

  private usarAfiliado(a: AfiliadoConPlanes) {
    this.afiliado.set(a);
    this.form.patchValue({ afiliadoId: a.id });
    this.cargarPlanes(a);
  }

  // Solo los planes vigentes del RUT son seleccionables; sin ninguno, Rezagado/MetLife.
  cargarPlanes(afi: AfiliadoConPlanes | null) {
    this.form.patchValue({ codPlan: "", cargaId: null });
    this.planOpts.set([]);
    this.cargas.set([]);
    this.planManual = false;
    this.planSugerido.set(false);
    if (!afi) return;
    this.afiliadosApi.cargas(afi.id).subscribe((cs) => this.cargas.set(cs));
    {
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
      this.codPlanSel.set(this.form.value.codPlan ?? "");
      this.elegirMejorPlan();
    }
  }

  // Anexo §VI l.518: con varios planes vigentes se preselecciona el de mayor cobertura, es decir,
  // el de menor copago para la materia elegida (calculado por la API). No pisa una elección manual.
  elegirMejorPlan() {
    const { materiaId, tipo } = this.form.value;
    const vigentes = (this.afiliado()?.planes ?? []).filter((p) => p.vigente).map((p) => p.codPlan);
    if (this.planManual || !materiaId || !tipo || vigentes.length < 2) {
      this.previsualizarCopago();
      return;
    }
    forkJoin(
      vigentes.map((codPlan) =>
        this.coberturasApi.copago(codPlan, materiaId, tipo as TipoAtencion).pipe(
          map((c) => ({ codPlan, copago: c.copagoUfCentesimas })),
          catchError(() => of({ codPlan, copago: null as number | null })),
        ),
      ),
    ).subscribe((rs) => {
      const conValor = rs.filter((r) => r.copago !== null) as { codPlan: string; copago: number }[];
      if (!conValor.length || this.planManual) {
        this.previsualizarCopago();
        return;
      }
      const mejor = conValor.reduce((a, b) => (b.copago < a.copago ? b : a));
      if (mejor.codPlan !== this.form.value.codPlan) this.form.patchValue({ cargaId: null });
      this.form.patchValue({ codPlan: mejor.codPlan });
      this.codPlanSel.set(mejor.codPlan);
      this.planSugerido.set(true);
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
      cargaId: v.cargaId || undefined,
      codigoGrabacion: v.codigoGrabacion || undefined,
      ...(v.tipo === "Consulta"
        ? {
            canalContacto: (v.canalContacto as CanalContacto) || undefined,
            tipoConsultaId: v.tipoConsultaId || undefined,
          }
        : {}),
    };
    const obs =
      v.tipo === "Consulta"
        ? this.api.crearConsulta(payload)
        : v.tipo === "Asesoria"
          ? this.api.crearAsesoria(payload)
          : v.tipo === "PosesionEfectiva"
            ? this.api.crearPosesion({
                ...payload,
                causante: {
                  causanteNombre: v.causanteNombre || null,
                  causanteRut: v.causanteRut || null,
                  causanteFechaDefuncion: v.causanteFechaDefuncion || null,
                  causanteUltimoDomicilio: v.causanteUltimoDomicilio || null,
                },
              })
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
