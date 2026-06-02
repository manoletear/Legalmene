import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { MultiSelectModule } from "primeng/multiselect";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { TabsModule } from "primeng/tabs";
import { AccordionModule } from "primeng/accordion";
import { PaginatorModule, PaginatorState } from "primeng/paginator";
import { ToastModule } from "primeng/toast";
import { MessageService } from "primeng/api";
import {
  WebhooksApiService,
  WebhookSus,
  WebhookEntrega,
  WEBHOOK_EVENTOS,
} from "../../core/services/webhooks.service";

type Severity = "success" | "info" | "warn" | "danger" | "secondary" | "contrast";

@Component({
  selector: "lm-admin-webhooks",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CardModule,
    TableModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    ToggleSwitchModule,
    TabsModule,
    AccordionModule,
    PaginatorModule,
    ToastModule,
  ],
  template: `
    <p-toast></p-toast>
    <p-tabs value="0">
      <p-tablist>
        <p-tab value="0">Suscripciones ({{ subs().length }})</p-tab>
        <p-tab value="1">Entregas</p-tab>
      </p-tablist>
      <p-tabpanels>
        <p-tabpanel value="0">
          <p-card [style]="{ display: 'block', 'margin-top': '16px' }" header="Nueva suscripción">
            <form [formGroup]="form" (ngSubmit)="crear()" class="lm-col" style="gap:12px; max-width:760px;">
              <div class="lm-col" style="gap:4px;">
                <label>Nombre</label>
                <input pInputText type="text" formControlName="nombre" />
              </div>
              <div class="lm-col" style="gap:4px;">
                <label>URL destino</label>
                <input pInputText type="text" formControlName="url" placeholder="https://ejemplo.com/webhook" />
              </div>
              <div class="lm-col" style="gap:4px;">
                <label>Eventos</label>
                <p-multiSelect
                  formControlName="eventos"
                  [options]="eventoOpts"
                  optionLabel="label"
                  optionValue="value"
                  appendTo="body"
                  placeholder="Selecciona eventos"
                ></p-multiSelect>
              </div>
              <button pButton type="submit" label="Crear" [disabled]="form.invalid"></button>
            </form>
          </p-card>

          <p-card [style]="{ display: 'block', 'margin-top': '16px' }">
            <p-table [value]="subs()" styleClass="p-datatable-sm">
              <ng-template pTemplate="header">
                <tr>
                  <th>Nombre</th>
                  <th>Eventos</th>
                  <th>Activo</th>
                  <th></th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-s>
                <tr>
                  <td>
                    <div>{{ s.nombre }}</div>
                    <small class="lm-muted">{{ s.url }}</small>
                  </td>
                  <td>
                    <p-tag *ngFor="let e of s.eventos" [value]="e" severity="secondary" [style]="{ 'margin-right': '4px' }"></p-tag>
                  </td>
                  <td>
                    <p-toggleSwitch [ngModel]="s.activo" (onChange)="toggleActivo(s, $event.checked)"></p-toggleSwitch>
                  </td>
                  <td>
                    <button pButton icon="pi pi-key" [text]="true" severity="secondary" (click)="copiarSecret(s)" pTooltip="Copiar secret"></button>
                    <button pButton icon="pi pi-trash" [text]="true" severity="danger" (click)="eliminar(s)" pTooltip="Eliminar"></button>
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="4" style="text-align:center; padding:24px;" class="lm-muted">Sin suscripciones.</td></tr>
              </ng-template>
            </p-table>
          </p-card>
        </p-tabpanel>

        <p-tabpanel value="1">
          <p-card [style]="{ display: 'block', 'margin-top': '16px' }">
            <p-accordion>
              <p-accordion-panel *ngFor="let e of entregas(); let i = index" [value]="i">
                <p-accordion-header>
                  <div class="lm-row" style="flex:1;">
                    <p-tag [value]="e.estado" [severity]="estadoSeverity(e.estado)"></p-tag>
                    <strong>{{ e.evento }}</strong>
                    <span class="lm-grow"></span>
                    <small class="lm-muted">
                      intentos: {{ e.intentos }} · http {{ e.httpStatus ?? '—' }} · {{ e.createdAt | date: 'short' }}
                    </small>
                  </div>
                </p-accordion-header>
                <p-accordion-content>
                  <p *ngIf="e.ultimoError"><strong>Error:</strong> {{ e.ultimoError }}</p>
                  <p *ngIf="e.respuesta"><strong>Respuesta:</strong></p>
                  <pre *ngIf="e.respuesta" style="background:#f5f5f5; padding:8px; border-radius:4px; max-height:200px; overflow:auto;">{{ e.respuesta }}</pre>
                  <button
                    pButton
                    *ngIf="e.estado === 'Fallida' || e.estado === 'Reintentar'"
                    [outlined]="true"
                    icon="pi pi-refresh"
                    label="Reintentar ahora"
                    (click)="reintentar(e)"
                  ></button>
                </p-accordion-content>
              </p-accordion-panel>
            </p-accordion>
            <p *ngIf="!entregas().length" class="lm-muted">Sin entregas registradas.</p>
            <p-paginator
              [first]="(entregasPage() - 1) * entregasPageSize()"
              [rows]="entregasPageSize()"
              [totalRecords]="entregasTotal()"
              [rowsPerPageOptions]="[25, 50, 100]"
              (onPageChange)="onEntregasPage($event)"
            ></p-paginator>
          </p-card>
        </p-tabpanel>
      </p-tabpanels>
    </p-tabs>
  `,
})
export class AdminWebhooksComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(WebhooksApiService);
  private msg = inject(MessageService);

  protected eventos = WEBHOOK_EVENTOS;
  protected eventoOpts = WEBHOOK_EVENTOS.map((e) => ({ label: e, value: e }));
  protected subs = signal<WebhookSus[]>([]);
  protected entregas = signal<WebhookEntrega[]>([]);
  protected entregasTotal = signal(0);
  protected entregasPage = signal(1);
  protected entregasPageSize = signal(50);

  protected form = this.fb.group({
    nombre: ["", Validators.required],
    url: ["", [Validators.required, Validators.pattern(/^https?:\/\//)]],
    eventos: [[] as string[], Validators.required],
  });

  ngOnInit() {
    this.recargar();
    this.recargarEntregas();
  }

  recargar() {
    this.api.listar().subscribe((r) => this.subs.set(r));
  }

  recargarEntregas() {
    this.api.entregas({ page: this.entregasPage(), pageSize: this.entregasPageSize() }).subscribe((r) => {
      this.entregas.set(r.data);
      this.entregasTotal.set(r.total);
    });
  }

  onEntregasPage(ev: PaginatorState) {
    const rows = ev.rows ?? this.entregasPageSize();
    const first = ev.first ?? 0;
    this.entregasPage.set(Math.floor(first / rows) + 1);
    this.entregasPageSize.set(rows);
    this.recargarEntregas();
  }

  crear() {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.api
      .crear({ nombre: v.nombre!, url: v.url!, eventos: (v.eventos as string[]) ?? [] })
      .subscribe({
        next: () => {
          this.form.reset({ nombre: "", url: "", eventos: [] as string[] });
          this.msg.add({ severity: "success", summary: "Suscripción creada", life: 2000 });
          this.recargar();
        },
        error: (err) =>
          this.msg.add({ severity: "error", summary: "Error", detail: err.error?.message ?? err.message, life: 4000 }),
      });
  }

  toggleActivo(s: WebhookSus, activo: boolean) {
    this.api.actualizar(s.id, { activo }).subscribe(() => this.recargar());
  }

  eliminar(s: WebhookSus) {
    if (!confirm(`¿Eliminar webhook "${s.nombre}"?`)) return;
    this.api.eliminar(s.id).subscribe(() => {
      this.msg.add({ severity: "success", summary: "Eliminada", life: 1500 });
      this.recargar();
    });
  }

  copiarSecret(s: WebhookSus) {
    void navigator.clipboard.writeText(s.secret);
    this.msg.add({ severity: "success", summary: "Secret copiado", life: 1500 });
  }

  reintentar(e: WebhookEntrega) {
    this.api.reintentar(e.id).subscribe(() => {
      this.msg.add({ severity: "success", summary: "Marcada Pendiente", detail: "Dispatcher la tomará en 30s", life: 3000 });
      this.recargarEntregas();
    });
  }

  estadoSeverity(e: string): Severity {
    if (e === "Enviada") return "success";
    if (e === "Fallida") return "danger";
    return "warn";
  }
}
