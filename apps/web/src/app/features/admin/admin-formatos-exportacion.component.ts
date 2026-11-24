import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { CardModule } from "primeng/card";
import { ButtonModule } from "primeng/button";
import { SelectModule } from "primeng/select";
import { CheckboxModule } from "primeng/checkbox";
import { MessageService } from "primeng/api";
import type { BusquedaExportable, FormatoExportacion } from "@legalmene/shared";
import { environment } from "../../../environments/environment";

const NOMBRES: Record<BusquedaExportable, string> = {
  afiliados: "Afiliados",
  consultas: "Consultas",
  asesorias: "Asesorías",
  juicios: "Juicios",
  posesiones: "Posesiones efectivas",
  derivaciones: "Derivaciones",
  aranceles: "Aranceles",
  provisiones: "Provisiones",
  pagos: "Pagos WebPay",
};

interface Columna {
  titulo: string;
  incluida: boolean;
}

// Anexo §XIII l.2207: el administrador define qué columnas trae cada exportación y en qué orden.
@Component({
  selector: "lm-admin-formatos-exportacion",
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, SelectModule, CheckboxModule],
  template: `
    <h1 style="margin:0 0 4px;">Formatos de exportación</h1>
    <p class="lm-muted" style="margin:0 0 12px;">
      Elija las columnas que trae cada planilla de búsqueda y su orden. Sin formato guardado se exportan todas.
    </p>
    <p-card>
      <div class="lm-row" style="gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
        <p-select [options]="opciones()" optionLabel="label" optionValue="value" [(ngModel)]="clave" (onChange)="elegir()"
          placeholder="Exportación" ariaLabel="Exportación" [style]="{ minWidth: '240px' }" data-testid="formato-clave"></p-select>
        <span *ngIf="actual() as f" class="lm-small lm-muted">
          {{ f.columnas ? 'Formato guardado el ' + (f.actualizadoEn | date: 'dd-MM-yyyy HH:mm') : 'Sin formato: se exportan todas las columnas' }}
        </span>
      </div>
      <ng-container *ngIf="actual()">
        <div *ngFor="let c of columnas(); let i = index; let ultimo = last" class="lm-row" style="gap:8px; align-items:center; padding:4px 0; border-bottom:1px solid var(--lm-border, #e5e7eb);">
          <p-checkbox [binary]="true" [(ngModel)]="c.incluida" [inputId]="'col-' + i" [ariaLabel]="c.titulo"></p-checkbox>
          <label [for]="'col-' + i" class="lm-grow" [class.lm-muted]="!c.incluida">{{ c.titulo }}</label>
          <button pButton size="small" [text]="true" icon="pi pi-arrow-up" [disabled]="i === 0" (click)="mover(i, -1)" [attr.aria-label]="'Subir ' + c.titulo"></button>
          <button pButton size="small" [text]="true" icon="pi pi-arrow-down" [disabled]="ultimo" (click)="mover(i, 1)" [attr.aria-label]="'Bajar ' + c.titulo"></button>
        </div>
        <div class="lm-row" style="gap:8px; margin-top:12px;">
          <button pButton icon="pi pi-save" label="Guardar formato" [disabled]="!incluidas()" (click)="guardar()" data-testid="formato-guardar"></button>
          <button pButton [outlined]="true" icon="pi pi-replay" label="Volver a todas las columnas" [disabled]="!actual()?.columnas" (click)="quitar()"></button>
        </div>
      </ng-container>
    </p-card>
  `,
})
export class AdminFormatosExportacionComponent implements OnInit {
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  private base = `${environment.apiBaseUrl}/exports/formatos`;
  protected formatos = signal<FormatoExportacion[]>([]);
  protected columnas = signal<Columna[]>([]);
  protected clave: BusquedaExportable | null = null;
  protected opciones = computed(() => this.formatos().map((f) => ({ value: f.clave, label: NOMBRES[f.clave] ?? f.clave })));
  protected actual = signal<FormatoExportacion | null>(null);

  ngOnInit() {
    this.cargar();
  }

  private cargar() {
    this.http.get<FormatoExportacion[]>(this.base).subscribe((f) => {
      this.formatos.set(f);
      if (this.clave) this.elegir();
    });
  }

  protected elegir() {
    const f = this.formatos().find((x) => x.clave === this.clave) ?? null;
    this.actual.set(f);
    if (!f) return this.columnas.set([]);
    // Primero las elegidas en su orden; luego el resto, sin marcar.
    const elegidas = f.columnas?.filter((c) => f.disponibles.includes(c)) ?? f.disponibles;
    const resto = f.disponibles.filter((c) => !elegidas.includes(c));
    this.columnas.set([...elegidas.map((titulo) => ({ titulo, incluida: true })), ...resto.map((titulo) => ({ titulo, incluida: false }))]);
  }

  protected incluidas(): number {
    return this.columnas().filter((c) => c.incluida).length;
  }

  protected mover(i: number, d: number) {
    const lista = [...this.columnas()];
    [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
    this.columnas.set(lista);
  }

  protected guardar() {
    if (!this.clave) return;
    const columnas = this.columnas().filter((c) => c.incluida).map((c) => c.titulo);
    this.http.put<FormatoExportacion>(`${this.base}/${this.clave}`, { columnas }).subscribe({
      next: () => {
        this.msg.add({ severity: "success", summary: "Formato guardado", life: 2500 });
        this.cargar();
      },
      error: (e) => this.msg.add({ severity: "error", summary: "No se pudo guardar", detail: e.error?.message ?? e.message, life: 5000 }),
    });
  }

  protected quitar() {
    if (!this.clave) return;
    this.http.delete(`${this.base}/${this.clave}`).subscribe(() => {
      this.msg.add({ severity: "success", summary: "Se exportarán todas las columnas", life: 2500 });
      this.cargar();
    });
  }
}
