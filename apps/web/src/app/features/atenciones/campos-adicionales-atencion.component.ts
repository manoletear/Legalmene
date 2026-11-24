import { Component, Input, OnChanges, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { CheckboxModule } from "primeng/checkbox";
import { MessageService } from "primeng/api";
import type { CampoAdicional, CamposDeAtencion, ValorCampoAdicional } from "@legalmene/shared";
import { MeService } from "../../core/services/me.service";
import { environment } from "../../../environments/environment";

// Campos que el administrador definió para la materia o el procedimiento de la atención (Anexo §XIII l.2396).
@Component({
  selector: "lm-campos-adicionales-atencion",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule, CheckboxModule],
  template: `
    <div *ngIf="campos().length" class="lm-info-card" data-testid="campos-adicionales">
      <div class="lm-info-card-header"><i class="pi pi-list-check"></i> Campos adicionales</div>
      <div *ngFor="let c of campos()" class="lm-col" style="gap:2px; margin-bottom:8px;">
        <label class="lm-small" [for]="'ca-' + c.id">{{ c.etiqueta }}<span *ngIf="c.obligatorio" style="color:#dc2626;"> *</span></label>
        <ng-container [ngSwitch]="c.tipoDato">
          <input *ngSwitchCase="'Numero'" pInputText [id]="'ca-' + c.id" inputmode="decimal" [(ngModel)]="valores[c.id]" [disabled]="!editable" />
          <input *ngSwitchCase="'Fecha'" pInputText [id]="'ca-' + c.id" type="date" [(ngModel)]="valores[c.id]" [disabled]="!editable" />
          <p-select *ngSwitchCase="'Opcion'" [inputId]="'ca-' + c.id" [options]="c.opciones ?? []" [(ngModel)]="valores[c.id]" [showClear]="!c.obligatorio" [disabled]="!editable" appendTo="body"></p-select>
          <p-checkbox *ngSwitchCase="'SiNo'" [inputId]="'ca-' + c.id" [binary]="true" [(ngModel)]="valores[c.id]" [disabled]="!editable"></p-checkbox>
          <input *ngSwitchDefault pInputText [id]="'ca-' + c.id" [(ngModel)]="valores[c.id]" maxlength="2000" [disabled]="!editable" />
        </ng-container>
      </div>
      <button *ngIf="editable" pButton size="small" [outlined]="true" icon="pi pi-save" label="Guardar campos" (click)="guardar()"></button>
    </div>
  `,
})
export class CamposAdicionalesAtencionComponent implements OnChanges {
  @Input({ required: true }) atencionId!: string;
  @Input() cerrada = false;
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private me = inject(MeService);
  protected campos = signal<CampoAdicional[]>([]);
  protected valores: Record<string, ValorCampoAdicional> = {};

  protected get editable(): boolean {
    return !this.cerrada && this.me.tiene("atenciones.editar");
  }

  private url() {
    return `${environment.apiBaseUrl}/atenciones/${this.atencionId}/campos-adicionales`;
  }

  ngOnChanges() {
    if (!this.atencionId) return;
    this.http.get<CamposDeAtencion>(this.url()).subscribe((r) => this.aplicar(r));
  }

  private aplicar(r: CamposDeAtencion) {
    this.campos.set(r.campos);
    this.valores = Object.fromEntries(r.campos.map((c) => [c.id, r.valores[c.id] ?? (c.tipoDato === "SiNo" ? false : null)]));
  }

  protected guardar() {
    this.http.put<CamposDeAtencion>(this.url(), { valores: this.valores }).subscribe({
      next: (r) => {
        this.aplicar(r);
        this.msg.add({ severity: "success", summary: "Campos guardados", life: 2500 });
      },
      error: (e) => this.msg.add({ severity: "error", summary: "No se pudo guardar", detail: e.error?.message ?? e.message, life: 5000 }),
    });
  }
}
