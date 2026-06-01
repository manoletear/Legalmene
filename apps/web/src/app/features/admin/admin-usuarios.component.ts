import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatCardModule } from "@angular/material/card";
import { MatTableModule } from "@angular/material/table";
import { MatChipsModule } from "@angular/material/chips";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { UsuariosAdminService, UsuarioAdmin } from "../../core/services/usuarios-admin.service";

const ROLES = ["Administrador", "Supervisor", "Abogado", "Operador", "Auditor"] as const;

@Component({
  selector: "lm-admin-usuarios",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatPaginatorModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Administración de usuarios</mat-card-title>
        <mat-card-subtitle>Cambios sincronizados con Entra ID en el siguiente login</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px; flex-wrap:wrap;">
          <mat-form-field appearance="outline" style="min-width:220px; flex:1;">
            <mat-label>Buscar (nombre o email)</mat-label>
            <input matInput [(ngModel)]="q" (keyup.enter)="recargar()" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="min-width:160px">
            <mat-label>Rol</mat-label>
            <mat-select [(ngModel)]="filtroRol" (selectionChange)="recargar()">
              <mat-option [value]="undefined">Todos</mat-option>
              <mat-option *ngFor="let r of roles" [value]="r">{{ r }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="min-width:140px">
            <mat-label>Estado</mat-label>
            <mat-select [(ngModel)]="filtroActivo" (selectionChange)="recargar()">
              <mat-option [value]="undefined">Todos</mat-option>
              <mat-option [value]="true">Activos</mat-option>
              <mat-option [value]="false">Inactivos</mat-option>
            </mat-select>
          </mat-form-field>
          <span style="flex:1"></span>
          <span style="opacity:0.7;">{{ total() }} resultados</span>
        </div>

        <table mat-table [dataSource]="data()" *ngIf="data().length; else vacio">
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let u">
              <div>{{ u.email }}</div>
              <small style="opacity:0.6;">{{ u.nombre }}</small>
            </td>
          </ng-container>
          <ng-container matColumnDef="rol">
            <th mat-header-cell *matHeaderCellDef>Rol</th>
            <td mat-cell *matCellDef="let u">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:160px;">
                <mat-select [value]="u.rol" (selectionChange)="cambiarRol(u, $event.value)">
                  <mat-option *ngFor="let r of roles" [value]="r">{{ r }}</mat-option>
                </mat-select>
              </mat-form-field>
            </td>
          </ng-container>
          <ng-container matColumnDef="planes">
            <th mat-header-cell *matHeaderCellDef>Planes</th>
            <td mat-cell *matCellDef="let u">
              <mat-chip *ngFor="let p of u.codPlanes" style="margin-right:4px;">{{ p }}</mat-chip>
            </td>
          </ng-container>
          <ng-container matColumnDef="activo">
            <th mat-header-cell *matHeaderCellDef>Activo</th>
            <td mat-cell *matCellDef="let u">
              <mat-slide-toggle [checked]="u.activo" (change)="cambiarActivo(u, $event.checked)" />
            </td>
          </ng-container>
          <ng-container matColumnDef="ultimo">
            <th mat-header-cell *matHeaderCellDef>Último login</th>
            <td mat-cell *matCellDef="let u">{{ u.ultimoLogin ? (u.ultimoLogin | date: 'short') : '—' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>
        <ng-template #vacio>
          <p *ngIf="!loading()" style="opacity:0.5;">Sin usuarios.</p>
        </ng-template>
        <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageSizeOptions]="[25, 50, 100]" (page)="onPage($event)" />
      </mat-card-content>
    </mat-card>
  `,
})
export class AdminUsuariosComponent implements OnInit {
  private api = inject(UsuariosAdminService);
  private snack = inject(MatSnackBar);

  protected cols = ["email", "rol", "planes", "activo", "ultimo"];
  protected data = signal<UsuarioAdmin[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected pageSize = signal(25);
  protected loading = signal(false);
  protected q = "";
  protected filtroRol: string | undefined;
  protected filtroActivo: boolean | undefined;
  protected roles = ROLES;

  ngOnInit() {
    this.recargar();
  }

  recargar() {
    this.loading.set(true);
    this.api
      .listar({
        page: this.page(),
        pageSize: this.pageSize(),
        q: this.q || undefined,
        rol: this.filtroRol,
        activo: this.filtroActivo,
      })
      .subscribe({
        next: (res) => {
          this.data.set(res.data);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onPage(ev: PageEvent) {
    this.page.set(ev.pageIndex + 1);
    this.pageSize.set(ev.pageSize);
    this.recargar();
  }

  cambiarRol(u: UsuarioAdmin, rol: string) {
    this.api.actualizar(u.id, { rol }).subscribe({
      next: () => this.snack.open(`${u.email} → ${rol}`, "OK", { duration: 2000 }),
      error: (err) => this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 4000 }),
    });
  }

  cambiarActivo(u: UsuarioAdmin, activo: boolean) {
    this.api.actualizar(u.id, { activo }).subscribe({
      next: () => this.snack.open(`${u.email} ${activo ? "activado" : "desactivado"}`, "OK", { duration: 2000 }),
      error: (err) => this.snack.open(`Error: ${err.error?.message ?? err.message}`, "Cerrar", { duration: 4000 }),
    });
  }
}
