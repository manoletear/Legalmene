import { Component, Injectable, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { InputNumberModule } from "primeng/inputnumber";
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from "primeng/dynamicdialog";
import { DocumentosApiService } from "../core/services/documentos.service";
import { ProvisionesApiService } from "../core/services/provisiones.service";

interface DatosGasto {
  provisionId: string;
  atencionId: string;
  correlativo: string;
}

// Gasto real contra fondos entregados, con su comprobante (Anexo §X 13). El comprobante se sube
// como documento de la atención y el gasto queda ligado a él.
@Component({
  selector: "lm-gasto-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, InputNumberModule],
  template: `
    <div class="lm-col" style="gap:12px; min-width:360px;">
      <label class="lm-col" style="gap:4px;">Monto en pesos *
        <p-inputNumber name="monto" [(ngModel)]="monto" [min]="1" [useGrouping]="true" locale="es-CL" prefix="$ "></p-inputNumber>
      </label>
      <label class="lm-col" style="gap:4px;">Detalle del gasto *
        <input pInputText name="glosa" [(ngModel)]="glosa" maxlength="300" placeholder="Receptor, perito, notaría…" />
      </label>
      <label class="lm-col" style="gap:4px;">Comprobante (PDF o imagen) *
        <input type="file" name="comprobante" accept="application/pdf,image/*" (change)="elegir($event)" />
      </label>
      <p *ngIf="error()" class="lm-error" role="alert" style="margin:0; color: var(--p-red-600, #c62828);">{{ error() }}</p>
      <div class="lm-row" style="justify-content:flex-end; gap:8px;">
        <button pButton type="button" label="Cancelar" [text]="true" severity="secondary" (click)="ref.close(false)"></button>
        <button pButton type="button" label="Registrar gasto" icon="pi pi-check" [loading]="guardando()" [disabled]="!valido()" (click)="guardar()"></button>
      </div>
    </div>
  `,
})
export class GastoDialogComponent implements OnInit {
  protected ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig<DatosGasto>);
  private documentos = inject(DocumentosApiService);
  private provisiones = inject(ProvisionesApiService);
  private data!: DatosGasto;
  protected monto: number | null = null;
  protected glosa = "";
  protected archivo: File | null = null;
  protected guardando = signal(false);
  protected error = signal<string | null>(null);

  ngOnInit() {
    this.data = this.config.data as DatosGasto;
  }

  elegir(ev: Event) {
    this.archivo = (ev.target as HTMLInputElement).files?.[0] ?? null;
  }

  protected valido(): boolean {
    return !!this.monto && this.monto > 0 && !!this.glosa.trim() && !!this.archivo;
  }

  async guardar() {
    if (!this.valido() || !this.archivo) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const doc = await firstValueFrom(this.documentos.upload(this.data.atencionId, this.archivo));
      await firstValueFrom(
        this.provisiones.registrarMovimiento(this.data.provisionId, { tipo: "Gasto", monto: this.monto!, glosa: this.glosa.trim(), documentoId: doc.id }),
      );
      this.ref.close(true);
    } catch (e) {
      const err = e as { error?: { message?: string }; message?: string };
      this.error.set(err.error?.message ?? err.message ?? "No se pudo registrar el gasto");
    } finally {
      this.guardando.set(false);
    }
  }
}

@Injectable({ providedIn: "root" })
export class GastoDialogService {
  private dialog = inject(DialogService);

  // true si se registró el gasto.
  open(datos: DatosGasto): Promise<boolean> {
    return new Promise((resolve) => {
      const ref = this.dialog.open(GastoDialogComponent, {
        header: `Registrar gasto · ${datos.correlativo}`,
        data: datos,
        closable: true,
        modal: true,
        width: "min(460px, 92vw)",
        duplicate: true,
      });
      ref.onClose.subscribe((v: boolean | undefined) => resolve(!!v));
    });
  }
}
