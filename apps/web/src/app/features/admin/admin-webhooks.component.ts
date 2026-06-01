import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatChipsModule } from "@angular/material/chips";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatTabsModule } from "@angular/material/tabs";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import {
  WebhooksApiService,
  WebhookSus,
  WebhookEntrega,
  WEBHOOK_EVENTOS,
} from "../../core/services/webhooks.service";

@Component({
  selector: "lm-admin-webhooks",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatExpansionModule,
    MatPaginatorModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-tab-group>
      <mat-tab label="Suscripciones ({{ subs().length }})">
        <mat-card style="margin-top:16px;">
          <mat-card-header>
            <mat-card-title>Nueva suscripción</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <form [formGroup]="form" (ngSubmit)="crear()" style="display:grid; gap:12px; max-width:760px;">
              <mat-form-field appearance="outline">
                <mat-label>Nombre</mat-label>
                <input matInput formControlName="nombre" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>URL destino</mat-label>
                <input matInput formControlName="url" placeholder="https://ejemplo.com/webhook" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Eventos</mat-label>
                <mat-select formControlName="eventos" multiple>
                  <mat-option *ngFor="let e of eventos" [value]="e">{{ e }}</mat-option>
                </mat-select>
              </mat-form-field>
              <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">Crear</button>
            </form>
          </mat-card-content>
        </mat-card>

        <mat-card style="margin-top:16px;">
          <mat-card-content>
            <table mat-table [dataSource]="subs()" *ngIf="subs().length; else vacioSubs">
              <ng-container matColumnDef="nombre">
                <th mat-header-cell *matHeaderCellDef>Nombre</th>
                <td mat-cell *matCellDef="let s">
                  <div>{{ s.nombre }}</div>
                  <small style="opacity:0.6;">{{ s.url }}</small>
                </td>
              </ng-container>
              <ng-container matColumnDef="eventos">
                <th mat-header-cell *matHeaderCellDef>Eventos</th>
                <td mat-cell *matCellDef="let s">
                  <mat-chip *ngFor="let e of s.eventos" style="margin-right:4px;">{{ e }}</mat-chip>
                </td>
              </ng-container>
              <ng-container matColumnDef="activo">
                <th mat-header-cell *matHeaderCellDef>Activo</th>
                <td mat-cell *matCellDef="let s">
                  <mat-slide-toggle [checked]="s.activo" (change)="toggleActivo(s, $event.checked)" />
                </td>
              </ng-container>
              <ng-container matColumnDef="acciones">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let s">
                  <button mat-icon-button (click)="copiarSecret(s)" matTooltip="Copiar secret">
                    <mat-icon>vpn_key</mat-icon>
                  </button>
                  <button mat-icon-button color="warn" (click)="eliminar(s)" matTooltip="Eliminar">
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="subsCols"></tr>
              <tr mat-row *matRowDef="let row; columns: subsCols"></tr>
            </table>
            <ng-template #vacioSubs>
              <p style="opacity:0.5;">Sin suscripciones.</p>
            </ng-template>
          </mat-card-content>
        </mat-card>
      </mat-tab>

      <mat-tab label="Entregas">
        <mat-card style="margin-top:16px;">
          <mat-card-content>
            <div *ngFor="let e of entregas()" style="margin-bottom:8px;">
              <mat-expansion-panel>
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <mat-chip [color]="estadoColor(e.estado)" highlighted style="margin-right:8px;">{{ e.estado }}</mat-chip>
                    {{ e.evento }}
                  </mat-panel-title>
                  <mat-panel-description>
                    intentos: {{ e.intentos }} · http {{ e.httpStatus ?? '—' }} · {{ e.createdAt | date: 'short' }}
                  </mat-panel-description>
                </mat-expansion-panel-header>
                <p *ngIf="e.ultimoError"><strong>Error:</strong> {{ e.ultimoError }}</p>
                <p *ngIf="e.respuesta"><strong>Respuesta:</strong></p>
                <pre *ngIf="e.respuesta" style="background:#f5f5f5; padding:8px; border-radius:4px; max-height:200px; overflow:auto;">{{ e.respuesta }}</pre>
                <button
                  *ngIf="e.estado === 'Fallida' || e.estado === 'Reintentar'"
                  mat-stroked-button
                  (click)="reintentar(e)"
                >
                  <mat-icon>refresh</mat-icon> Reintentar ahora
                </button>
              </mat-expansion-panel>
            </div>
            <p *ngIf="!entregas().length" style="opacity:0.5;">Sin entregas registradas.</p>
            <mat-paginator
              [length]="entregasTotal()"
              [pageSize]="entregasPageSize()"
              [pageSizeOptions]="[25, 50, 100]"
              (page)="onEntregasPage($event)"
            />
          </mat-card-content>
        </mat-card>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class AdminWebhooksComponent implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(WebhooksApiService);
  private snack = inject(MatSnackBar);

  protected eventos = WEBHOOK_EVENTOS;
  protected subsCols = ["nombre", "eventos", "activo", "acciones"];
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

  onEntregasPage(ev: PageEvent) {
    this.entregasPage.set(ev.pageIndex + 1);
    this.entregasPageSize.set(ev.pageSize);
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
          this.snack.open("Suscripción creada", "OK", { duration: 2000 });
          this.recargar();
        },
        error: (err) =>
          this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 4000 }),
      });
  }

  toggleActivo(s: WebhookSus, activo: boolean) {
    this.api.actualizar(s.id, { activo }).subscribe(() => this.recargar());
  }

  eliminar(s: WebhookSus) {
    if (!confirm(`¿Eliminar webhook "${s.nombre}"?`)) return;
    this.api.eliminar(s.id).subscribe(() => {
      this.snack.open("Eliminada", "OK", { duration: 1500 });
      this.recargar();
    });
  }

  copiarSecret(s: WebhookSus) {
    void navigator.clipboard.writeText(s.secret);
    this.snack.open("Secret copiado", "OK", { duration: 1500 });
  }

  reintentar(e: WebhookEntrega) {
    this.api.reintentar(e.id).subscribe(() => {
      this.snack.open("Marcada Pendiente; dispatcher la tomará en 30s", "OK", { duration: 3000 });
      this.recargarEntregas();
    });
  }

  estadoColor(e: string) {
    if (e === "Enviada") return "primary";
    if (e === "Fallida") return "warn";
    return "accent";
  }
}
