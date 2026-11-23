import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { CardModule } from "primeng/card";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { ToggleSwitchModule } from "primeng/toggleswitch";
import { MessageService } from "primeng/api";
import type { Feriado } from "@legalmene/shared";
import { environment } from "../../../environments/environment";

// Feriados usados para los plazos en días hábiles. Los legales se cargan solos cada año; aquí se
// agregan los de decreto o elecciones y se desactivan los que no correspondan.
@Component({
  selector: "lm-admin-feriados",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, TableModule, TagModule, ButtonModule, InputTextModule, SelectModule, ToggleSwitchModule],
  template: `
    <p-card [style]="{ display: 'block', 'margin-top': '16px' }">
      <div class="lm-row" style="flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:16px;">
        <p-select [(ngModel)]="anio" [options]="anios" (onChange)="recargar()" [style]="{ width: '120px' }" ariaLabel="Año"></p-select>
        <span class="lm-grow"></span>
        <input pInputText type="date" name="fechaFeriado" [(ngModel)]="nueva.fecha" aria-label="Fecha del feriado" />
        <input pInputText name="nombreFeriado" [(ngModel)]="nueva.nombre" placeholder="Nombre (p. ej. Elecciones presidenciales)" style="min-width:260px;" maxlength="200" />
        <button pButton icon="pi pi-plus" label="Agregar feriado" [disabled]="!nueva.fecha || !nueva.nombre.trim()" (click)="agregar()"></button>
      </div>
      <small class="lm-muted">Los plazos en días hábiles (gestiones predefinidas, entrega de fondos, alertas) saltan estos días. Los legales se cargan automáticamente para el año en curso y el siguiente.</small>
      <p-table [value]="filas()" [loading]="loading()" styleClass="p-datatable-sm" [style]="{ 'margin-top': '12px' }">
        <ng-template pTemplate="header">
          <tr><th>Fecha</th><th>Día</th><th>Nombre</th><th>Origen</th><th>Vigente</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-f>
          <tr>
            <td class="lm-mono">{{ f.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
            <td>{{ f.fecha + 'T12:00:00Z' | date: 'EEEE' : 'UTC' }}</td>
            <td>{{ f.nombre }}</td>
            <td><p-tag [value]="f.origen === 'Legal' ? 'Legal' : 'Agregado'" [severity]="f.origen === 'Legal' ? 'info' : 'warn'"></p-tag></td>
            <td><p-toggleSwitch [ngModel]="f.vigente" (onChange)="cambiarVigencia(f, $event.checked)" [ariaLabel]="'Vigente ' + f.fecha"></p-toggleSwitch></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="5" class="lm-muted" style="text-align:center;">Sin feriados para este año.</td></tr></ng-template>
      </p-table>
    </p-card>
  `,
})
export class AdminFeriadosComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private base = `${environment.apiBaseUrl}/feriados`;
  private actual = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date()).slice(0, 4));
  protected anios = [this.actual - 1, this.actual, this.actual + 1];
  protected anio = this.actual;
  protected filas = signal<Feriado[]>([]);
  protected loading = signal(false);
  protected nueva = { fecha: "", nombre: "" };

  ngOnInit() {
    this.recargar();
  }

  private error(summary: string, err: { error?: { message?: string }; message: string }) {
    this.msg.add({ severity: "error", summary, detail: err.error?.message ?? err.message, life: 5000 });
  }

  recargar() {
    this.loading.set(true);
    this.http.get<Feriado[]>(this.base, { params: { anio: this.anio } }).subscribe({
      next: (f) => {
        this.filas.set(f);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error("No se pudieron cargar los feriados", e);
      },
    });
  }

  agregar() {
    this.http.post<Feriado>(this.base, { fecha: this.nueva.fecha, nombre: this.nueva.nombre.trim() }).subscribe({
      next: (f) => {
        this.msg.add({ severity: "success", summary: "Feriado agregado", detail: f.fecha, life: 2500 });
        this.nueva = { fecha: "", nombre: "" };
        this.anio = Number(f.fecha.slice(0, 4));
        this.recargar();
      },
      error: (e) => this.error("No se pudo agregar", e),
    });
  }

  cambiarVigencia(f: Feriado, vigente: boolean) {
    this.http.put<Feriado>(`${this.base}/${f.id}`, { vigente }).subscribe({
      next: () => this.recargar(),
      error: (e) => {
        this.error("No se pudo actualizar", e);
        this.recargar();
      },
    });
  }
}
