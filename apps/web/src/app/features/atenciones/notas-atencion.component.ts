import { Component, Input, OnChanges, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { ButtonModule } from "primeng/button";
import { TextareaModule } from "primeng/textarea";
import { MessageService } from "primeng/api";
import type { NotaAtencion } from "@legalmene/shared";
import { PermisoDirective } from "../../core/permisos";
import { environment } from "../../../environments/environment";

// Notas internas de la atención (Anexo §IV l.382): avisan al abogado asignado.
@Component({
  selector: "lm-notas-atencion",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TextareaModule, PermisoDirective],
  template: `
    <div data-testid="notas">
      <div *ngIf="!notas().length" class="lm-muted">Sin notas.</div>
      <div *ngFor="let n of notas()" style="padding:8px 0; border-bottom:1px solid #f1f5f9;">
        <div class="lm-small lm-muted">{{ n.autor }} → {{ n.destinatario ?? 'sin destinatario' }} · {{ n.createdAt | date: 'dd-MM-yyyy HH:mm' }}</div>
        <div style="white-space:pre-wrap;">{{ n.texto }}</div>
      </div>
      <ng-container *lmPermiso="'gestiones.registrar'">
        <textarea pTextarea rows="3" [(ngModel)]="texto" name="nota" placeholder="Nota para el abogado" style="width:100%; margin-top:8px;" maxlength="2000"></textarea>
        <button pButton size="small" icon="pi pi-send" label="Agregar nota" [disabled]="!texto.trim()" (click)="agregar()"></button>
      </ng-container>
    </div>
  `,
})
export class NotasAtencionComponent implements OnChanges {
  @Input({ required: true }) atencionId!: string;
  private http = inject(HttpClient);
  private msg = inject(MessageService);
  protected notas = signal<NotaAtencion[]>([]);
  protected texto = "";

  private url() {
    return `${environment.apiBaseUrl}/atenciones/${this.atencionId}/notas`;
  }

  ngOnChanges() {
    if (this.atencionId) this.http.get<NotaAtencion[]>(this.url()).subscribe((n) => this.notas.set(n));
  }

  protected agregar() {
    this.http.post<NotaAtencion>(this.url(), { texto: this.texto.trim() }).subscribe({
      next: (n) => {
        this.notas.update((l) => [...l, n]);
        this.texto = "";
      },
      error: (e) => this.msg.add({ severity: "error", summary: "No se pudo agregar la nota", detail: e.error?.message ?? e.message, life: 5000 }),
    });
  }
}
