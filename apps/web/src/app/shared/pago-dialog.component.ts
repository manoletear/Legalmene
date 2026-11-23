import { Component, Injectable, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { SelectModule } from "primeng/select";
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from "primeng/dynamicdialog";
import type { MedioPago } from "@legalmene/shared";

export interface DatosPagoIngresados {
  medio: MedioPago;
  fecha: string;
  cuotas?: number;
  referencia?: string;
}

interface DatosDialogo {
  // Medios que se ofrecen (WebPay se registra solo por la pasarela).
  medios?: MedioPago[];
  detalle?: string;
}

const ETIQUETAS: Record<MedioPago, string> = {
  CasaCentral: "Pago en casa central",
  Transferencia: "Transferencia bancaria",
  WebPay: "WebPay",
};

// Registro de un pago del cliente (Anexo §IX 5.4, §X 05): medio, fecha, cuotas y referencia.
@Component({
  selector: "lm-pago-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule],
  template: `
    <div class="lm-col" style="gap:12px; min-width:360px;">
      <small *ngIf="data.detalle" class="lm-muted">{{ data.detalle }}</small>
      <label class="lm-col" style="gap:4px;">Medio de pago *
        <p-select name="medio" [(ngModel)]="medio" [options]="opciones" optionLabel="label" optionValue="value" appendTo="body"></p-select>
      </label>
      <label class="lm-col" style="gap:4px;">Fecha de pago *
        <input pInputText type="date" name="fechaPago" [(ngModel)]="fecha" [max]="hoy" />
      </label>
      <label class="lm-col" style="gap:4px;">Cuotas
        <p-inputNumber name="cuotas" [(ngModel)]="cuotas" [min]="1" [max]="48" [showButtons]="true" placeholder="Contado"></p-inputNumber>
      </label>
      <label class="lm-col" style="gap:4px;">Referencia {{ medio === 'Transferencia' ? '*' : '' }}
        <input pInputText name="referencia" [(ngModel)]="referencia" maxlength="80" placeholder="N° de transferencia, depósito o boleta" />
      </label>
      <div class="lm-row" style="justify-content:flex-end; gap:8px;">
        <button pButton type="button" label="Cancelar" [text]="true" severity="secondary" (click)="ref.close(null)"></button>
        <button pButton type="button" label="Registrar pago" icon="pi pi-check" [disabled]="!valido()" (click)="confirmar()"></button>
      </div>
    </div>
  `,
})
export class PagoDialogComponent implements OnInit {
  protected ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig<DatosDialogo>);
  protected data: DatosDialogo = {};
  protected hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  protected opciones: { label: string; value: MedioPago }[] = [];
  protected medio: MedioPago = "CasaCentral";
  protected fecha = this.hoy;
  protected cuotas: number | null = null;
  protected referencia = "";

  ngOnInit() {
    this.data = this.config.data ?? {};
    const medios = this.data.medios ?? ["CasaCentral", "Transferencia"];
    this.opciones = medios.map((m) => ({ label: ETIQUETAS[m], value: m }));
    this.medio = medios[0];
  }

  protected valido(): boolean {
    return !!this.medio && !!this.fecha && this.fecha <= this.hoy && (this.medio !== "Transferencia" || !!this.referencia.trim());
  }

  protected confirmar() {
    if (!this.valido()) return;
    const r: DatosPagoIngresados = { medio: this.medio, fecha: this.fecha };
    if (this.cuotas) r.cuotas = this.cuotas;
    if (this.referencia.trim()) r.referencia = this.referencia.trim();
    this.ref.close(r);
  }
}

@Injectable({ providedIn: "root" })
export class PagoDialogService {
  private dialog = inject(DialogService);

  open(header: string, data: DatosDialogo = {}): Promise<DatosPagoIngresados | null> {
    return new Promise((resolve) => {
      const ref = this.dialog.open(PagoDialogComponent, { header, data, closable: true, modal: true, width: "min(440px, 92vw)", duplicate: true });
      ref.onClose.subscribe((v: DatosPagoIngresados | null | undefined) => resolve(v ?? null));
    });
  }
}
