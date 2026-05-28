import { Component } from "@angular/core";
import { MatCardModule } from "@angular/material/card";

@Component({
  selector: "lm-atenciones-list",
  standalone: true,
  imports: [MatCardModule],
  template: `
    <mat-card>
      <mat-card-header><mat-card-title>Atenciones</mat-card-title></mat-card-header>
      <mat-card-content>
        <p>Listado de consultas, asesorías y juicios. Vista por implementar.</p>
      </mat-card-content>
    </mat-card>
  `,
})
export class AtencionesListComponent {}
