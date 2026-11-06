import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute } from "@angular/router";
import { CardModule } from "primeng/card";

interface StubData {
  titulo: string;
  descripcion: string;
  icono?: string;
}

@Component({
  selector: "lm-stub-page",
  standalone: true,
  imports: [CommonModule, CardModule],
  template: `
    <h1 style="margin: 0 0 24px 0;">{{ data().titulo }}</h1>
    <p-card>
      <div style="display:flex; flex-direction:column; align-items:center; padding:48px 24px; text-align:center;">
        <div
          style="width:80px; height:80px; border-radius:20px; background:linear-gradient(135deg, #dbeafe, #eff6ff); display:flex; align-items:center; justify-content:center; margin-bottom:16px;"
        >
          <i class="pi {{ data().icono || 'pi-clock' }}" style="font-size:36px; color:#2563eb;"></i>
        </div>
        <h2 style="margin:0 0 8px 0; color:#0f172a;">{{ data().descripcion }}</h2>
        <p class="lm-muted">Esta sección está en desarrollo. Próximamente disponible.</p>
      </div>
    </p-card>
  `,
})
export class StubPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  protected data = signal<StubData>({ titulo: "Próximamente", descripcion: "" });

  ngOnInit() {
    const d = this.route.snapshot.data as Partial<StubData>;
    this.data.set({
      titulo: d.titulo ?? "Próximamente",
      descripcion: d.descripcion ?? "",
      icono: d.icono,
    });
  }
}
