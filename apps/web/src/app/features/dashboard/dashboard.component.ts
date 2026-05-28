import { Component } from "@angular/core";
import { MatCardModule } from "@angular/material/card";

@Component({
  selector: "lm-dashboard",
  standalone: true,
  imports: [MatCardModule],
  template: `
    <h1>Dashboard</h1>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
      <mat-card>
        <mat-card-header><mat-card-title>Consultas hoy</mat-card-title></mat-card-header>
        <mat-card-content><h2>—</h2></mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Asesorías abiertas</mat-card-title></mat-card-header>
        <mat-card-content><h2>—</h2></mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Juicios en curso</mat-card-title></mat-card-header>
        <mat-card-content><h2>—</h2></mat-card-content>
      </mat-card>
      <mat-card>
        <mat-card-header><mat-card-title>Comités pendientes</mat-card-title></mat-card-header>
        <mat-card-content><h2>—</h2></mat-card-content>
      </mat-card>
    </div>
  `,
})
export class DashboardComponent {}
